import { BigInt, BigDecimal, ethereum, log, Address } from "@graphprotocol/graph-ts"
import { LiquidityPool } from "../generated/schema"
import {
    Trade as TradeEvent,
    TransferFeeToReferrer as TransferFeeToReferrerEvent,
} from '../generated/templates/LiquidityPool/LiquidityPool'

import {
    AddMiningPool as AddMiningPoolEvent,
    DelMiningPool as DelMiningPoolEvent,
    RebateRateChange as RebateRateChangeEvent,
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
    fetchLiquidityPool,
} from "./utils"

export function handleAddMiningPool(event: AddMiningPoolEvent): void {
    let miningInfo = fetchMiningInfo()
    let pools = miningInfo.pools
    pools.push(event.params.pool.toHexString())
    miningInfo.pools = pools
    miningInfo.save()
    let pool = fetchLiquidityPool(event.params.pool)
    LiquidityPoolTemplate.create(event.params.pool)
}

export function handleDelMiningPool(event: DelMiningPoolEvent): void {
    let delPool = event.params.pool.toHexString()
    let miningInfo = fetchMiningInfo()
    let pools = []
    for (let index = 0; index < miningInfo.pools.length; index++) {
        if (delPool != miningInfo.pools[index]) {
            pools.push(miningInfo.pools[index])
        }
    }
    miningInfo.pools = pools
    miningInfo.save()
}

export function handleRebateRateChange(event: RebateRateChangeEvent): void {
    let miningInfo = fetchMiningInfo()
    miningInfo.rebateRate = convertToDecimal(event.params.newRebateRate, BI_18)
    miningInfo.save()
}

export function handleMiningBudgetChange(event: MiningBudgetChangeEvent): void {
    let miningInfo = fetchMiningInfo()
    miningInfo.budget = convertToDecimal(event.params.newBudget, BI_18)
    miningInfo.save()
}

export function RewardPaid(event: RewardPaidEvent): void {
}

export function handleTrade(event: TradeEvent): void {
    let poolAddr = event.address.toHexString()
    let liquidityPool = LiquidityPool.load(poolAddr)
    if (liquidityPool == null) {
        return
    }
    let miningInfo = fetchMiningInfo()
    let isExist = false
    for (let index = 0; index < miningInfo.pools.length; index++) {
        if (poolAddr == miningInfo.pools[index]) {
            isExist = true
            break
        }
    }
    if (!isExist) {
        return
    }
    let trader = fetchUser(event.params.trader)
    let account = fetchTradeAccount(trader, liquidityPool as LiquidityPool)
    let price = convertToDecimal(event.params.price, BI_18)
    let position = convertToDecimal(event.params.position, BI_18)
    let fee = convertToDecimal(event.params.fee, BI_18)
    let volume = AbsBigDecimal(position).times(price)
    let volumeUSD = ZERO_BD

    // todo token price
    trader.totalEarnMCB += fee 
    trader.save()
    account.tradeVolume += volume
    account.tradeVolumeUSD += volumeUSD
    account.totalFee += fee
    account.totalFeeUSD += fee
    account.earnMCB += fee
    account.save()
}

export function handleTransferFeeToReferrer(event: TransferFeeToReferrerEvent): void {

}