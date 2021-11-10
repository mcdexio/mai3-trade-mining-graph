import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

import { MarkPrice, User, MarginAccount, Trade, PerpetualTradeBlock } from '../generated/schema'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let ZERO_FIVE_BD = BigDecimal.fromString('0.5')
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
    marginAccount.totalFee = ZERO_BD
    marginAccount.lpFee = ZERO_BD
    marginAccount.operatorFee = ZERO_BD
    marginAccount.vaultFee = ZERO_BD
    marginAccount.totalFeeFactor = ZERO_BD
    marginAccount.lpFeeFactor = ZERO_BD
    marginAccount.operatorFeeFactor = ZERO_BD
    marginAccount.vaultFeeFactor = ZERO_BD
    marginAccount.referralRebate = ZERO_BD
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

export function fetchPerpetualTradeBlock(pool: Address, perpetualIndex: BigInt, blockNumber: BigInt): PerpetualTradeBlock {
  let id = pool.toHexString()
  .concat('-')
  .concat(perpetualIndex.toString())
  .concat('-')
  .concat(blockNumber.toString())
  let perpBlock = PerpetualTradeBlock.load(id)
  if (perpBlock === null) {
    perpBlock = new PerpetualTradeBlock(id)
    perpBlock.blockNumber = blockNumber
    perpBlock.trades = []
    perpBlock.save()
  }
  return perpBlock as PerpetualTradeBlock
}

export function fetchTrade(account: MarginAccount, transactionHash: string, perpBlock: PerpetualTradeBlock): Trade {
  let id = transactionHash.concat('-').concat(account.id)
  let trade = Trade.load(id)
  if (trade === null) {
    trade = new Trade(id)
    trade.user = account.user
    trade.trader = account.id
    trade.perpBlock = perpBlock.id
    trade.amount = ZERO_BD
    trade.price = ZERO_BD
    trade.fee = ZERO_BD
    trade.lpFee = ZERO_BD
    trade.operatorFee = ZERO_BD
    trade.vaultFee = ZERO_BD
    trade.referralRebate = ZERO_BD
    trade.isWashTrading = false
    trade.blockNumber = perpBlock.blockNumber
    trade.timestamp = 0
    trade.effectiveFactor = ZERO_BD
    trade.save()

    let trades = perpBlock.trades
    trades.push(trade.id)
    perpBlock.trades = trades
    perpBlock.save()
  }
  return trade as Trade
}