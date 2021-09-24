import {LiquidityPool, MarkPrice} from "../generated/schema"
import {
    Trade as TradeEvent,
    UpdatePrice as UpdatePriceEvent,
    Redeem as RedeemEvent,
    Stake as StakeEvent
} from '../generated/templates/LiquidityPool/LiquidityPool'

import {
    AbsBigDecimal,
    BI_18,
    convertToDecimal,
    fetchTradeAccount,
    fetchUser,
    getTokenPrice,
    splitCloseAmount,
    splitOpenAmount,
    ZERO_BD
} from "./utils"
import {getMCBPrice} from "./uniswap"

export function handleTrade(event: TradeEvent): void {
    let poolAddr = event.address.toHexString()
    let liquidityPool = LiquidityPool.load(poolAddr)
    if (liquidityPool == null) {
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

    let feeUSD = fee.times(tokenPrice)
    let volumeUSD = volume.times(tokenPrice)

    // update user earned MCB
    user.totalFee += feeUSD

    // update account trade info
    account.tradeVolume += volume
    account.tradeVolumeUSD += volumeUSD
    account.totalFee += fee
    account.totalFeeUSD += feeUSD
    account.save()

    let close = splitCloseAmount(user.position, position)
    let open = splitOpenAmount(user.position, position)

    // close position
    if (close != ZERO_BD) {
        user.position = user.position.plus(close)
    }

    // open position
    if (open != ZERO_BD) {
        user.position = user.position.plus(open)
    }
    user.save()
}

export function handleRedeem(event: RedeemEvent): void {
    let user = fetchUser(event.params.account)
    user.stackMCB -= event.params.redeemed
    user.save()
}

export function handleStake(event: StakeEvent): void {
    let user = fetchUser(event.params.account)
    user.stackMCB = event.params.totalStaked
    user.save()
}

export function handleUpdatePrice(event: UpdatePriceEvent): void {
    let id = event.address.toHexString()
      .connect('-')
      .connect(event.params.perpetualIndex.toString()
      .connect(event.params.oracle))
    let markPrice = MarkPrice.load(id)
    markPrice.price = convertToDecimal(event.params.markPrice, BI_18)
    markPrice.timestamp = event.params.markPriceUpdateTime
    markPrice.save()
}