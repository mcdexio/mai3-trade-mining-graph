import { MarkPrice, User, MarginAccount, Trade} from "../generated/schema"
import {
    Trade as TradeEvent,
    UpdatePrice as UpdatePriceEvent,
    Liquidate as LiquidateEvent,
    TransferFeeToReferrer as TransferFeeToReferrerEvent,
    TransferFeeToOperator as TransferFeeToOperatorEvent,
    TransferFeeToVault as TransferFeeToVaultEvent,
} from '../generated/LiquidityPool/LiquidityPool'

import { log, BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

import {
    Redeem as RedeemEvent,
    Stake as StakeEvent
} from '../generated/StakePool/StakePool'

import {
    BI_18,
    convertToDecimal, END_TIME, fetchMarginAccount, fetchMarkPrice,
    fetchUser,
    fetchTrade,
    fetchPerpetualTradeBlock,
    ONE_BD,
    ZERO_FIVE_BD,
    START_TIME,
} from "./utils"

export function handleTrade(event: TradeEvent): void {
    let timestamp = event.block.timestamp.toBigDecimal()
    if (timestamp > END_TIME) {
        return
    }
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    
    let fee = convertToDecimal(event.params.fee, BI_18)
    let lpFee = convertToDecimal(event.params.lpFee, BI_18)
    let position = convertToDecimal(event.params.position, BI_18)
    let price = convertToDecimal(event.params.price, BI_18)
    log.debug("user {} PerpIndex {} position {}", [event.params.trader.toHexString(), event.params.perpetualIndex.toString(), position.toString()])
    log.debug("{} convert => position: {}", [event.params.position.toString(), position.toString()])
    marginAccount.position += position
    
    let perpTradeBlock = fetchPerpetualTradeBlock(event.address, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)
    trade.amount = position
    trade.price = price
    let isWashTrading = false
    let trades = perpTradeBlock.trades as string[]
    for (let i=0; i < trades.length; i++) {
        let tradeInSameBlock = Trade.load(trades[i]) as Trade
        // find anti wash trade, decrease fee added before
        if (tradeInSameBlock.amount == position.neg()) {
            let trader = MarginAccount.load(trade.trader)
            trader.totalFee -= tradeInSameBlock.fee
            trader.lpFee -= tradeInSameBlock.lpFee
            trader.operatorFee -= tradeInSameBlock.operatorFee
            trader.vaultFee -= tradeInSameBlock.vaultFee
            trader.referralRebate -= tradeInSameBlock.referralRebate
            trader.save()
            isWashTrading = true
        }
    }

    if (isWashTrading) {
        trade.save()
        marginAccount.save()
        user.save()
        return
    }

    // EffectiveTradingFee=(1−0.5∗(ElapsedTime/TotalEpochTime))∗TradingFee
    let factor = computeEffectiveFactor(timestamp)
    trade.fee = factor * fee
    trade.lpFee = factor * lpFee
    trade.save()

    marginAccount.totalFee += factor * fee
    marginAccount.lpFee += factor * lpFee

    marginAccount.save()
    user.save()
}

export function computeEffectiveFactor(timestamp: BigDecimal): BigDecimal {
    let totalEpochTime = END_TIME - START_TIME
    let elapsedTime = timestamp - START_TIME
    let timeWeight = elapsedTime / totalEpochTime
    return ONE_BD - ZERO_FIVE_BD*timeWeight
}

export function handleLiquidate(event: LiquidateEvent): void {
    let timestamp = event.block.timestamp.toBigDecimal()
    if (timestamp > END_TIME) {
        return
    }
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let position = convertToDecimal(event.params.amount, BI_18)
    marginAccount.position += position
    marginAccount.save()
}

export function handleRedeem(event: RedeemEvent): void {
    let user = fetchUser(event.params.account)
    user.stakedMCB -= convertToDecimal(event.params.redeemed, BI_18)
    user.save()
}

export function handleStake(event: StakeEvent): void {
    let user = fetchUser(event.params.account)
    user.stakedMCB = convertToDecimal(event.params.totalStaked, BI_18)
    user.unlockMCBTime = event.params.unlockTime.toI32()
    user.save()
}

export function handleUpdatePrice(event: UpdatePriceEvent): void {
    let markPrice = fetchMarkPrice(event.address, event.params.perpetualIndex)
    markPrice.price = convertToDecimal(event.params.markPrice, BI_18)
    markPrice.timestamp = event.params.markPriceUpdateTime.toI32()
    markPrice.save()
}

export function handleTransferFeeToReferrer(event: TransferFeeToReferrerEvent): void {
    let timestamp = event.block.timestamp.toBigDecimal()
    if (timestamp > END_TIME) {
        return
    }
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let referralRebate = convertToDecimal(event.params.referralRebate, BI_18)

    let perpTradeBlock = fetchPerpetualTradeBlock(event.address, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)
    // EffectiveTradingFee=(1−0.5∗(ElapsedTime/TotalEpochTime))∗TradingFee
    let factor = computeEffectiveFactor(timestamp)
    trade.referralRebate += referralRebate*factor
    trade.save()
    marginAccount.referralRebate += referralRebate*factor
    marginAccount.save()
}

export function handleTransferFeeToOperator(event: TransferFeeToOperatorEvent): void {
    let timestamp = event.block.timestamp.toBigDecimal()
    if (timestamp > END_TIME) {
        return
    }
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let operatorFee = convertToDecimal(event.params.operatorFee, BI_18)
    // EffectiveTradingFee=(1−0.5∗(ElapsedTime/TotalEpochTime))∗TradingFee
    let factor = computeEffectiveFactor(timestamp)
    let perpTradeBlock = fetchPerpetualTradeBlock(event.address, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)

    let operatorAddress = event.params.operator.toHexString()
    log.debug("transferFeeToOperator user {}, operatorAddress {}, perpetualIndex {}, amount {}", [
        event.params.trader.toHexString(), event.params.operator.toHexString(), event.params.perpetualIndex.toString(),
        operatorFee.toString()
    ])
    if (operatorAddress == '0xcfa46e1b666fd91bf39028055d506c1e4ca5ad6e') {
        // bsc: MCDEX dao operator
        marginAccount.operatorFee += operatorFee * factor
        trade.operatorFee += operatorFee*factor
        trade.save()
    } else if (operatorAddress == '0xa2aad83466241232290bebcd43dcbff6a7f8d23a') {
        // arb-rinkeby: test operator
        marginAccount.operatorFee += operatorFee * factor
        trade.operatorFee += operatorFee*factor
        trade.save()
    }
    marginAccount.save()
}

export function handleTransferFeeToVault(event: TransferFeeToVaultEvent): void {
    let timestamp = event.block.timestamp.toBigDecimal()
    if (timestamp > END_TIME) {
        return
    }
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let vaultFee = convertToDecimal(event.params.vaultFee, BI_18)
    log.debug("transferFeeToVault user {}, vaultAddress {}, perpetualIndex {}, amount {}", [
        event.params.trader.toHexString(), event.params.vault.toHexString(), event.params.perpetualIndex.toString(),
        vaultFee.toString()
    ])
    // EffectiveTradingFee=(1−0.5∗(ElapsedTime/TotalEpochTime))∗TradingFee
    let factor = computeEffectiveFactor(timestamp)
    let perpTradeBlock = fetchPerpetualTradeBlock(event.address, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)
    trade.vaultFee += vaultFee*factor
    trade.save()
    marginAccount.vaultFee += vaultFee*factor
    marginAccount.save()
}