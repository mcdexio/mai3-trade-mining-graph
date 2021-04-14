import { BigInt, BigDecimal, ethereum, log, Address } from "@graphprotocol/graph-ts"
import { LiquidityPool, Perpetual } from "../generated/schema"
import {
    Trade as TradeEvent,
    TransferFeeToReferrer as TransferFeeToReferrerEvent,
} from '../generated/templates/LiquidityPool/LiquidityPool'

import {
    SetMiningPool as SetMiningPoolEvent,
    MiningRateChange as MiningRateChangeEvent,
    MiningBudgetChange as MiningBudgetChangeEvent,
    RewardPaid as RewardPaidEvent,
} from '../generated/Mining/Mining'

import { 
    LiquidityPool as LiquidityPoolTemplate,
} from '../generated/templates'

import {
    BI_18,
    ZERO_BD,
    fetchUser,
    fetchTradeAccount,
    convertToDecimal,
    AbsBigDecimal,
    fetchMiningInfo,
} from "./utils"

export function handleSetMiningPool(event: SetMiningPoolEvent): void {
    let miningInfo = fetchMiningInfo()
    let pools = miningInfo.pools
    pools.push(event.params.pool.toHexString())
    miningInfo.pools = pools
    miningInfo.save()
    LiquidityPoolTemplate.create(event.params.pool)
}

export function handleMiningRateChange(event: MiningRateChangeEvent): void {
    let miningInfo = fetchMiningInfo()
    miningInfo.rebateRate = convertToDecimal(event.params.newMiningRate, BI_18)
    miningInfo.save()
}

export function handleMiningBudget(event: MiningBudgetChangeEvent): void {
    let miningInfo = fetchMiningInfo()
    miningInfo.budget = convertToDecimal(event.params.newBudget, BI_18)
    miningInfo.save()
}

export function RewardPaid(event: RewardPaidEvent): void {
}

export function handleTrade(event: TradeEvent): void {
    let liquidityPool = LiquidityPool.load(event.address.toHexString())
    if (liquidityPool == null) {
        return
    }
    let miningInfo = fetchMiningInfo()
    let id = event.address.toHexString()
        .concat('-')
        .concat(event.params.perpetualIndex.toString())
    let perp = Perpetual.load(id)
    let trader = fetchUser(event.params.trader)
    let account = fetchTradeAccount(trader, perp as Perpetual)
    let price = convertToDecimal(event.params.price, BI_18)
    let position = convertToDecimal(event.params.position, BI_18)
    let fee = convertToDecimal(event.params.fee, BI_18)
    let volume = AbsBigDecimal(position).times(price)
    let volumeUSD = ZERO_BD

    // todo token price
    account.tradeVolume += volume
    account.volumeUSD += volumeUSD
    account.totalFee += fee
    account.totalFeeUSD += fee
    account.earnMCB += fee
    account.save()
}

export function handleTransferFeeToReferrer(event: TransferFeeToReferrerEvent): void {

}