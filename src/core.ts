import { BigInt, BigDecimal, ethereum, log, Address } from "@graphprotocol/graph-ts"
import { LiquidityPool, PriceBucket } from "../generated/schema"
import {
    Trade as TradeEvent,
    TransferFeeToReferrer as TransferFeeToReferrerEvent,
} from '../generated/templates/LiquidityPool/LiquidityPool'

import { Oracle as OracleContract } from '../generated/Mining/Oracle'

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
    TWO_BD,
    ADDRESS_ZERO,
    fetchUser,
    fetchTradeAccount,
    convertToDecimal,
    AbsBigDecimal,
    fetchMiningInfo,
    fetchLiquidityPool,
    isReferrerInWhiteList,
    getTokenPrice,
} from "./utils"
import { OracleList, TokenList, MCB_ADDRESS } from "./const"

export function handleAddMiningPool(event: AddMiningPoolEvent): void {
    let miningInfo = fetchMiningInfo()
    let pools = miningInfo.pools
    pools.push(event.params.pool.toHexString())
    miningInfo.pools = pools
    miningInfo.save()
    let pool = fetchLiquidityPool(event.params.pool)
    pool.collateralAddress = event.params.collateral.toHexString()
    pool.save()
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

export function handleRewardPaid(event: RewardPaidEvent): void {
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

    let tokenPrice = getTokenPrice(liquidityPool.collateralAddress)

    let mcbPrice = getTokenPrice(MCB_ADDRESS)

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

export function handleTransferFeeToReferrer(event: TransferFeeToReferrerEvent): void {
    let referrer = event.params.referrer.toHexString()
    if (referrer == ADDRESS_ZERO || isReferrerInWhiteList(event.params.referrer.toHexString())) {
        return
    }
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

    // decrease rebate fee to referrer
    let fee = convertToDecimal(event.params.referralRebate, BI_18)

    let tokenPrice = getTokenPrice(liquidityPool.collateralAddress)
    let mcbPrice = getTokenPrice(MCB_ADDRESS)

    let feeUSD = fee.times(tokenPrice)
    let rebateValue = fee.times(miningInfo.rebateRate).times(tokenPrice).div(mcbPrice)

    // update user earned MCB
    user.totalFee -= feeUSD
    user.totalEarnMCB -= rebateValue
    user.unPaidMCB -= rebateValue
    user.save()

    // update mined budget
    miningInfo.minedBudget -= rebateValue
    miningInfo.save()

    // update account trade info 
    account.totalFee -= fee
    account.totalFeeUSD -= feeUSD
    account.earnMCB -= rebateValue
    account.save()
}

export function handleTokenPrice(block: ethereum.block): void {
    let timestamp = block.timestamp.toI32()
    // update token price every 10 min
    let index = timestamp / 600
    let startUnix = index * 600

    for (let i = 0; i < TokenList.length; i++) {
        let priceBucket = PriceBucket.load(TokenList[i])
        if (priceBucket == null) {
            priceBucket = new PriceBucket(TokenList[i])
            priceBucket.price = getPriceFromOracle(OracleList[i])
            priceBucket.timestamp = startUnix
            priceBucket.save()
            continue
        }

        if (priceBucket.timestamp != startUnix) {
            let price = getPriceFromOracle(OracleList[i])
            priceBucket.price = priceBucket.price.plus(price).div(TWO_BD)
            priceBucket.timestamp = startUnix
            priceBucket.save()
        }
    }
}

function getPriceFromOracle(oracle: string): BigDecimal {
    let contract = OracleContract.bind(Address.fromString(oracle))
    let callResult = contract.try_priceTWAPShort()
    if(callResult.reverted){
        log.warning("try_priceTWAPShort reverted. oracle: {}", [oracle])
        return ZERO_BD
    }

    return convertToDecimal(callResult.value.value0, BI_18)
}