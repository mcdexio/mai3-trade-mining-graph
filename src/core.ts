import { MarginAccount, Trade} from "../generated/schema"
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
    let eventAddr = event.address
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, eventAddr, event.params.perpetualIndex)
    
    let fee = convertToDecimal(event.params.fee, BI_18)
    let lpFee = convertToDecimal(event.params.lpFee, BI_18)
    let position = convertToDecimal(event.params.position, BI_18)
    let price = convertToDecimal(event.params.price, BI_18)
    log.debug("user {} PerpIndex {} position {}", [event.params.trader.toHexString(), event.params.perpetualIndex.toString(), position.toString()])
    log.debug("{} convert => position: {}", [event.params.position.toString(), position.toString()])
    marginAccount.position += position
    
    let perpTradeBlock = fetchPerpetualTradeBlock(eventAddr, event.params.perpetualIndex, event.block.number)
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

    let markPrice = getMarkPrice(eventAddr)

    // EffectiveTradingFee=(1−0.5∗(ElapsedTime/TotalEpochTime))∗TradingFee
    let factor = computeEffectiveFactor(event.block.timestamp)
    trade.fee = factor * fee * markPrice
    trade.lpFee = factor * lpFee * markPrice
    trade.effectiveFactor = factor
    trade.save()

    marginAccount.totalFee +=  fee * markPrice
    marginAccount.lpFee +=  lpFee * markPrice
    marginAccount.totalFeeFactor += factor * fee * markPrice
    marginAccount.lpFeeFactor += factor * lpFee * markPrice

    marginAccount.save()
    user.save()
}

export function getMarkPrice(eventAddr: Address): BigDecimal {
    // inverse contract
    if (eventAddr.toHexString() == '0x2ea001032b0eb424120b4dec51bf02db0df46c78') {
        // bsc's BTCB: 0x2ea001032b0eb424120b4dec51bf02db0df46c78
        let markPrice = fetchMarkPrice(Address.fromString("0xdb282bbace4e375ff2901b84aceb33016d0d663d"), BigInt.fromString("0"))
        return markPrice.price
    }
    if (eventAddr.toHexString() == '0xf6b2d76c248af20009188139660a516e5c4e0532') {
        // bsc's ETH: 0xf6b2d76c248af20009188139660a516e5c4e0532
        let markPrice = fetchMarkPrice(Address.fromString("0xdb282bbace4e375ff2901b84aceb33016d0d663d"), BigInt.fromString("1"))
        return markPrice.price
    }
    if (eventAddr.toHexString() == '0xfdd10c021b43c4be1b9f0473bad686e546d98b00') {
        // bsc's SATS: 0xfdd10c021b43c4be1b9f0473bad686e546d98b00
        let markPrice = fetchMarkPrice(Address.fromString("0xdb282bbace4e375ff2901b84aceb33016d0d663d"), BigInt.fromString("0"))
        let powTen = BigDecimal.fromString("100000000")
        return markPrice.price.div(powTen)
    }
    if (eventAddr.toHexString() == '0xc7b2ad78fded2bbc74b50dc1881ce0f81a7a0cca') {
        // arb's ETH: 0xc7b2ad78fded2bbc74b50dc1881ce0f81a7a0cca
        let markPrice = fetchMarkPrice(Address.fromString("0xab324146c49b23658e5b3930e641bdbdf089cbac"), BigInt.fromString("0"))
        return markPrice.price
    }

    // usd quote directly add fee
    // bsc's BUSD: 0xdb282bbace4e375ff2901b84aceb33016d0d663d
    // bsc's OpenDao: 0x23cda00836e60d213d8e7b0c50c1e268e67b96f1
    // bsc's USX: 0x0a848c92295369794d38dfa1e4d26612cad2dfa8
    // bsc's MIM: 0xd2bb2ff558ba807866db36d9d1e8d31ee7076862
    // arb's USDC: 0xab324146c49b23658e5b3930e641bdbdf089cbac
    // arb-rinkeby's USDC: 0xc32a2dfee97e2babc90a2b5e6aef41e789ef2e13
    return BigDecimal.fromString("1")
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
    let eventAddr = event.address
    let marginAccount = fetchMarginAccount(user, eventAddr, event.params.perpetualIndex)
    let referralRebate = convertToDecimal(event.params.referralRebate, BI_18)
    let perpTradeBlock = fetchPerpetualTradeBlock(eventAddr, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)
    let factor = computeEffectiveFactor(event.block.timestamp)
    let markPrice = getMarkPrice(eventAddr)
    trade.referralRebate += referralRebate*factor*markPrice
    trade.save()
    marginAccount.referralRebateFactor += referralRebate*factor*markPrice
    marginAccount.referralRebate += referralRebate*markPrice
    marginAccount.save()
}

export function handleTransferFeeToOperator(event: TransferFeeToOperatorEvent): void {
    let user = fetchUser(event.params.trader)
    let eventAddr = event.address
    let marginAccount = fetchMarginAccount(user, eventAddr, event.params.perpetualIndex)
    let operatorFee = convertToDecimal(event.params.operatorFee, BI_18)
    let factor = computeEffectiveFactor(event.block.timestamp)
    let markPrice = getMarkPrice(eventAddr)
    let perpTradeBlock = fetchPerpetualTradeBlock(eventAddr, event.params.perpetualIndex, event.block.number)
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
        marginAccount.operatorFeeFactor += operatorFee * factor * markPrice
        marginAccount.operatorFee += operatorFee * markPrice
        trade.operatorFee += operatorFee*factor * markPrice
    }
    trade.save()
    marginAccount.save()
}

export function handleTransferFeeToVault(event: TransferFeeToVaultEvent): void {
    let user = fetchUser(event.params.trader)
    let eventAddr = event.address
    let marginAccount = fetchMarginAccount(user, eventAddr, event.params.perpetualIndex)
    let vaultFee = convertToDecimal(event.params.vaultFee, BI_18)
    let factor = computeEffectiveFactor(event.block.timestamp)
    let markPrice = getMarkPrice(eventAddr)
    let perpTradeBlock = fetchPerpetualTradeBlock(eventAddr, event.params.perpetualIndex, event.block.number)
    let trade = fetchTrade(marginAccount, event.transaction.hash.toHex(), perpTradeBlock)

    log.debug("transferFeeToVault user {}, vaultAddress {}, perpetualIndex {}, amount {}", [
        event.params.trader.toHexString(), event.params.vault.toHexString(), event.params.perpetualIndex.toString(),
        vaultFee.toString()
    ])

    trade.vaultFee += vaultFee*factor*markPrice
    trade.save()
    marginAccount.vaultFeeFactor += vaultFee*factor*markPrice
    marginAccount.vaultFee += vaultFee*markPrice
    marginAccount.save()
}