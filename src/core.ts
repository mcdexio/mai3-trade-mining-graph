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
    let pools = miningInfo.pools
    let newPools:string[] = []
    for (let index = 0; index < pools.length; index++) {
        if (delPool != pools[index]) {
            newPools.push(pools[index])
        }
    }
    miningInfo.pools = newPools
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
    let user = fetchUser(event.params.user)
    let reward = convertToDecimal(event.params.reward, BI_18)
    user.paidMCB += reward
    user.unPaidMCB -= reward
    user.paidBlock = event.params.paidBlock
    user.save()
}

export function handleTrade(event: TradeEvent): void {
    let miningInfo = fetchMiningInfo()
    // mining budget reach
    if (miningInfo.budget <= miningInfo.minedBudget) {
        return
    }
    let poolAddr = event.address.toHexString()
    let liquidityPool = LiquidityPool.load(poolAddr)
    if (liquidityPool == null) {
        return
    }

    // check pool in mining pool list
    let isExist = false
    let pools = miningInfo.pools
    for (let index = 0; index < pools.length; index++) {
        if (poolAddr == pools[index]) {
            isExist = true
            break
        }
    }
    if (!isExist) {
        return
    }

    let user = fetchUser(event.params.trader)
    // user account in each pool
    let account = fetchTradeAccount(user, liquidityPool as LiquidityPool)

    let price = convertToDecimal(event.params.price, BI_18)
    let position = convertToDecimal(event.params.position, BI_18)
    let fee = convertToDecimal(event.params.fee, BI_18)
    let volume = AbsBigDecimal(position).times(price)
    let volumeUSD = ZERO_BD

    // todo token price
    // update user earned MCB
    user.totalEarnMCB += fee 
    user.unPaidMCB += fee
    user.save()

    // update mined budget
    miningInfo.minedBudget += fee
    miningInfo.save()

    // update account trade info 
    account.tradeVolume += volume
    account.tradeVolumeUSD += volumeUSD
    account.totalFee += fee
    account.totalFeeUSD += fee
    account.earnMCB += fee
    account.save()
}

export function handleTransferFeeToReferrer(event: TransferFeeToReferrerEvent): void {

}