import { TypedMap, log, BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

import { LiquidityPool, User, TradeAccount, MiningInfo, PriceBucket } from '../generated/schema'
import { ERC20 as ERC20Contract } from '../generated/Mining/ERC20'
import { Oracle as OracleContract } from '../generated/Mining/Oracle'

import {
  USDTokens,
  OracleMap,
  ReferrerWhiteList
} from './const'


export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export let MINING_ID = "MCDEX"

export function isUSDToken(token: string): boolean {
  for (let i = 0; i < USDTokens.length; i++) {
    if (token == USDTokens[i]) {
      return true
    }
  }
  return false
}

export function isReferrerInWhiteList(collateral: string): boolean {
  for (let i = 0; i < ReferrerWhiteList.length; i++) {
    if (collateral == ReferrerWhiteList[i]) {
      return true
    }
  }
  return false
}

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function convertToDecimal(amount: BigInt, decimals: BigInt): BigDecimal {
  if (decimals == ZERO_BI) {
    return amount.toBigDecimal()
  }
  return amount.toBigDecimal().div(exponentToBigDecimal(decimals))
}

export function AbsBigDecimal(x: BigDecimal): BigDecimal {
  if (x >= ZERO_BD) {
    return x
  }
  return -x
}

export function fetchUser(address: Address): User {
  let user = User.load(address.toHexString())
  if (user === null) {
    user = new User(address.toHexString())
    user.totalEarnMCB = ZERO_BD
    user.totalFee = ZERO_BD
    user.paidMCB = ZERO_BD
    user.paidBlock = ZERO_BI
    user.unPaidMCB = ZERO_BD
    user.save()
  }
  return user as User
}

export function fetchLiquidityPool(address: Address): LiquidityPool {
  let pool = LiquidityPool.load(address.toHexString())
  if (pool === null) {
    pool = new LiquidityPool(address.toHexString())
    pool.collateralAddress = ""
    pool.save()
  }
  return pool as LiquidityPool
}

export function fetchMiningInfo(): MiningInfo {
  let info = MiningInfo.load(MINING_ID)
  if (info === null) {
    info = new MiningInfo(MINING_ID)
    info.rebateRate = ZERO_BD
    info.budget = ZERO_BD
    info.minedBudget = ZERO_BD
    info.pools = []
    info.save()
  }
  return info as MiningInfo
}

export function fetchTradeAccount(user: User, pool: LiquidityPool): TradeAccount {
  let id = pool.id.concat('-').concat(user.id)
  let account = TradeAccount.load(id)
  if (account === null) {
    account = new TradeAccount(id)
    account.user = user.id
    account.pool = pool.id
    account.tradeVolume = ZERO_BD
    account.tradeVolumeUSD = ZERO_BD
    account.totalFee = ZERO_BD
    account.totalFeeUSD = ZERO_BD
    account.earnMCB = ZERO_BD
    account.save()
  }
  return account as TradeAccount
}

export function fetchCollateralSymbol(address: Address): string {
  let contract = ERC20Contract.bind(address)
  let collateral = ''
  let result = contract.try_symbol()
  if (!result.reverted) {
    collateral = result.value
  }
  return collateral
}

export function getTokenPrice(token: string, timestamp: BigInt): BigDecimal {
  if (isUSDToken(token)) {
    return ONE_BD
  }

  let priceBucket = PriceBucket.load(token)
  if (priceBucket == null || (timestamp - priceBucket.timestamp) >= BigInt.fromI32(86400)) {
    let price = getPriceFromOracle(token)
    let priceBucket = new PriceBucket(token)
    priceBucket.price = price
    priceBucket.timestamp = timestamp
    priceBucket.save()
    return price
  }
  return priceBucket.price
}

function getPriceFromOracle(token: string): BigDecimal {
  let oracle = OracleMap.get(token) as string
  if (oracle == null) {
    return ZERO_BD
  }
  let contract = OracleContract.bind(Address.fromString(oracle))
  let callResult = contract.try_priceTWAPShort()
  if(callResult.reverted){
      log.warning("try_priceTWAPShort reverted. oracle: {}", [oracle])
      return ZERO_BD
  }

  return convertToDecimal(callResult.value.value0, BI_18)
}