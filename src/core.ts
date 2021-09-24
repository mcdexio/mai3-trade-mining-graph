import {BigInt, BigDecimal, ethereum, log, Address} from "@graphprotocol/graph-ts"
import {LiquidityPool, PriceBucket, MarkPrice} from "../generated/schema"
import {
    Trade as TradeEvent,
} from '../generated/templates/LiquidityPool/LiquidityPool'

import {
    BI_18,
    ADDRESS_ZERO,
    fetchUser,
    fetchTradeAccount,
    convertToDecimal,
    AbsBigDecimal,
    fetchMiningInfo,
    fetchLiquidityPool,
    isReferrerInWhiteList,
    getTokenPrice,
    ZERO_BD, fetchMarkPrice,
} from "./utils"
import {MCB_ADDRESS} from "./const"
import {getMCBPrice} from "./uniswap"
import {updateTradeMiningDayData} from "./dataUpdate";

export function handleTrade(event: TradeEvent): void {
    let miningInfo = fetchMiningInfo()
    // mining budget reach
    if ((miningInfo.budget <= miningInfo.minedBudget) || (miningInfo.rebateRate == ZERO_BD)) {
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

    let tokenPrice = getTokenPrice(liquidityPool.collateralAddress, event.block.timestamp)

    let mcbPrice = getMCBPrice()

    let feeUSD = fee.times(tokenPrice)
    let volumeUSD = volume.times(tokenPrice)
    let rebateValue = fee.times(miningInfo.rebateRate).times(tokenPrice).div(mcbPrice)


    // update mined budget
    let minedBudget = miningInfo.minedBudget + rebateValue
    if (minedBudget > miningInfo.budget) {
        rebateValue -= (minedBudget - miningInfo.budget)
    }
    miningInfo.minedBudget += rebateValue
    miningInfo.save()

    // update trade mining day data
    updateTradeMiningDayData(poolAddr, event.block.timestamp, rebateValue, mcbPrice)

    // update user earned MCB
    user.totalFee += feeUSD
    user.totalEarnMCB += rebateValue
    user.unPaidMCB += rebateValue
    user.save()


    // update account trade info 
    account.tradeVolume += volume
    account.tradeVolumeUSD += volumeUSD
    account.totalFee += fee
    account.totalFeeUSD += feeUSD
    account.earnMCB += rebateValue
    account.save()
}

export function handleRedeem(event: Redeem): void {
    let user = fetchUser(event.params.account)
    user.stackMCB -= event.params.redeemed
    user.save()
}

export function handleStake(event: Stake): void {
    let user = fetchUser(event.params.account)
    user.stackMCB = event.params.totalStaked
    user.save()
}

export function handleUpdatePrice(event: UpdatePrice): void {
    let markPrice = fetchMarkPrice(event.params.oracle)
    markPrice.price = event.params.markPrice
    markPrice.timestamp = event.params.markPriceUpdateTime
    markPrice.save()
}