import { MarkPrice, User, MarginAccount} from "../generated/schema"
import {
    Trade as TradeEvent,
    UpdatePrice as UpdatePriceEvent,
    Liquidate as LiquidateEvent,
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
} from "./utils"

export function handleTrade(event: TradeEvent): void {
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    // user account in each pool
    let fee = convertToDecimal(event.params.fee, BI_18)
    let position = convertToDecimal(event.params.position, BI_18)
    log.debug("user {} PerpIndex {} position {}", [event.params.trader.toHexString(), event.params.perpetualIndex.toString(), position.toString()])
    log.debug("{} convert => position: {}", [event.params.position.toString(), position.toString()])
    marginAccount.position += position

    marginAccount.save()

    user.totalFee += fee
    user.save()
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