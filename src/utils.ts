import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

import { MarkPrice, User, MarginAccount } from '../generated/schema'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)
export let BI_6 = BigInt.fromI32(6)

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

export function fetchUser(address: Address): User {
  let user = User.load(address.toHexString())
  if (user === null) {
    user = new User(address.toHexString())
    user.totalFee = ZERO_BD
    user.stakedMCB = ZERO_BD
    user.unlockMCBTime = 0
    user.save()
  }
  return user as User
}

export function fetchMarginAccount(user: User, pool: Address, perpetualIndex: BigInt): MarginAccount {
  let id = pool.toHexString()
    .concat('-')
    .concat(perpetualIndex.toString())
    .concat('-')
    .concat(user.id)
  let marginAccount = MarginAccount.load(id)
  if (marginAccount === null) {
    marginAccount = new MarginAccount(id)
    marginAccount.user = user.id
    marginAccount.position = ZERO_BD
    marginAccount.save()
  }
  return marginAccount as MarginAccount
}

export function fetchMarkPrice(pool: Address, perpetualIndex: BigInt): MarkPrice {
  let id = pool.toHexString()
    .concat('-')
    .concat(perpetualIndex.toString())
  let markPrice = MarkPrice.load(id)
  if (markPrice === null) {
    markPrice = new MarkPrice(id)
    markPrice.price = ZERO_BD
    markPrice.timestamp = 0
    markPrice.save()
  }
  return markPrice as MarkPrice
}