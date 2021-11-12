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
    convertToDecimal, fetchMarginAccount, fetchMarkPrice,
    fetchUser,
    fetchTrade,
    fetchPerpetualTradeBlock,
    ONE_BD,
    ZERO_FIVE_BD,
    ZERO_BD,
} from "./utils"

let START_TIME = BigInt.fromI32(1634515200) // epoch 1 startTime
let EPOCH_DURATION = BigInt.fromI32(14*24*60*60)

export function handleTrade(event: TradeEvent): void {
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
    // check anti wash trading from epoch 2
    if (event.block.timestamp > (START_TIME + EPOCH_DURATION)) {
        let trades = perpTradeBlock.trades as string[]
        for (let i=0; i < trades.length; i++) {
            let tradeInSameBlock = Trade.load(trades[i]) as Trade
            // find anti wash trading, decrease fee added before
            if (tradeInSameBlock.amount == position.neg()) {
                let trader = MarginAccount.load(tradeInSameBlock.trader)
                trader.totalFeeFactor -= tradeInSameBlock.fee
                trader.lpFeeFactor -= tradeInSameBlock.lpFee
                trader.operatorFeeFactor -= tradeInSameBlock.operatorFee
                trader.vaultFeeFactor -= tradeInSameBlock.vaultFee
                trader.referralRebateFactor -= tradeInSameBlock.referralRebate
                trader.save()

                tradeInSameBlock.fee = ZERO_BD
                tradeInSameBlock.lpFee = ZERO_BD
                tradeInSameBlock.operatorFee = ZERO_BD
                tradeInSameBlock.vaultFee = ZERO_BD
                tradeInSameBlock.referralRebate = ZERO_BD
                tradeInSameBlock.isWashTrading = true
                tradeInSameBlock.save()
                trade.isWashTrading = true
            }
        }
    }

    trade.amount = position
    trade.price = price
    trade.timestamp = event.block.timestamp.toI32()
    if (trade.isWashTrading) {
        trade.save()
        marginAccount.save()
        user.save()
        return
    }

    // EffectiveTradingFee=(1−0.5∗(ElapsedTime/TotalEpochTime))∗TradingFee
    let factor = computeEffectiveFactor(event.block.timestamp)
    trade.fee = factor * fee
    trade.lpFee = factor * lpFee
    trade.effectiveFactor = factor
    trade.save()

    marginAccount.totalFee +=  fee
    marginAccount.lpFee +=  lpFee
    marginAccount.totalFeeFactor += factor * fee
    marginAccount.lpFeeFactor += factor * lpFee

    marginAccount.save()
    user.save()
}

export function computeEffectiveFactor(timestamp: BigInt): BigDecimal {
    let startTime = START_TIME
    let endTime = START_TIME

    if (timestamp > START_TIME && timestamp <= (START_TIME + EPOCH_DURATION)) {
        // epoch 1
        endTime = START_TIME + EPOCH_DURATION
        return ONE_BD
    } else if (timestamp > (START_TIME + EPOCH_DURATION) && 
        timestamp <= (START_TIME + EPOCH_DURATION * BigInt.fromI32(2)))
    {
        // epoch 2
        startTime = START_TIME+EPOCH_DURATION
        endTime = START_TIME + EPOCH_DURATION*BigInt.fromI32(2)
    } else if (timestamp > (START_TIME + EPOCH_DURATION * BigInt.fromI32(2)) && 
        timestamp <= (START_TIME + EPOCH_DURATION * BigInt.fromI32(3)))
    {
        // epoch 3
        startTime = START_TIME+EPOCH_DURATION * BigInt.fromI32(2)
        endTime = START_TIME + EPOCH_DURATION*BigInt.fromI32(3)
    } else if (timestamp > (START_TIME + EPOCH_DURATION * BigInt.fromI32(3)) && 
        timestamp <= (START_TIME + EPOCH_DURATION * BigInt.fromI32(4)))
    {
        // epoch 4
        startTime = START_TIME+EPOCH_DURATION * BigInt.fromI32(3)
        endTime = START_TIME + EPOCH_DURATION*BigInt.fromI32(4)
    } else if (timestamp > (START_TIME + EPOCH_DURATION * BigInt.fromI32(4)) && 
        timestamp <= (START_TIME + EPOCH_DURATION * BigInt.fromI32(5)))
    {
        // epoch 5
        startTime = START_TIME+EPOCH_DURATION * BigInt.fromI32(4)
        endTime = START_TIME + EPOCH_DURATION*BigInt.fromI32(5)
    } else if (timestamp > (START_TIME + EPOCH_DURATION * BigInt.fromI32(5)) && 
        timestamp <= (START_TIME + EPOCH_DURATION * BigInt.fromI32(6)))
    {
        // epoch 6
        startTime = START_TIME+EPOCH_DURATION * BigInt.fromI32(5)
        endTime = START_TIME + EPOCH_DURATION*BigInt.fromI32(6)
    } else {
        return ONE_BD
    }

    if (startTime >= endTime) {
        return ONE_BD
    }
    // EffectiveTradingFee=(1−0.5∗(ElapsedTime/TotalEpochTime))∗TradingFee
    let totalEpochTime = endTime.toBigDecimal() - startTime.toBigDecimal()
    let elapsedTime = timestamp - startTime
    let timeWeight = elapsedTime.toBigDecimal() / totalEpochTime
    return ONE_BD - ZERO_FIVE_BD*timeWeight
}

export function handleLiquidate(event: LiquidateEvent): void {
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
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let referralRebate = convertToDecimal(event.params.referralRebate, BI_18)

    let perpTradeBlock = fetchPerpetualTradeBlock(event.address, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)
    let factor = computeEffectiveFactor(event.block.timestamp)
    trade.referralRebate += referralRebate*factor
    trade.save()
    marginAccount.referralRebateFactor += referralRebate*factor
    marginAccount.referralRebate += referralRebate
    marginAccount.save()
}

export function handleTransferFeeToOperator(event: TransferFeeToOperatorEvent): void {
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let operatorFee = convertToDecimal(event.params.operatorFee, BI_18)
    let factor = computeEffectiveFactor(event.block.timestamp)
    let perpTradeBlock = fetchPerpetualTradeBlock(event.address, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)

    let operatorAddress = event.params.operator.toHexString()
    log.debug("transferFeeToOperator user {}, operatorAddress {}, perpetualIndex {}, amount {}", [
        event.params.trader.toHexString(), event.params.operator.toHexString(), event.params.perpetualIndex.toString(),
        operatorFee.toString()
    ])
    if ((operatorAddress == '0xcfa46e1b666fd91bf39028055d506c1e4ca5ad6e') ||
        (operatorAddress == '0xe9e60660459428e43aba1c334d1246747f2aa856')) {
        // bsc: 0xcfa46e1b666fd91bf39028055d506c1e4ca5ad6e MCDEX dao operator
        // arb: 0xe9e60660459428e43aba1c334d1246747f2aa856 MCDEX dao operator
        marginAccount.operatorFeeFactor += operatorFee * factor
        marginAccount.operatorFee += operatorFee
        trade.operatorFee += operatorFee*factor
    }
    trade.save()
    marginAccount.save()
}

export function handleTransferFeeToVault(event: TransferFeeToVaultEvent): void {
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let vaultFee = convertToDecimal(event.params.vaultFee, BI_18)
    let factor = computeEffectiveFactor(event.block.timestamp)
    let perpTradeBlock = fetchPerpetualTradeBlock(event.address, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)

    log.debug("transferFeeToVault user {}, vaultAddress {}, perpetualIndex {}, amount {}", [
        event.params.trader.toHexString(), event.params.vault.toHexString(), event.params.perpetualIndex.toString(),
        vaultFee.toString()
    ])

    trade.vaultFee += vaultFee*factor
    trade.save()
    marginAccount.vaultFeeFactor += vaultFee*factor
    marginAccount.vaultFee += vaultFee
    marginAccount.save()
}