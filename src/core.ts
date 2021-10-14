import { MarkPrice, User, MarginAccount} from "../generated/schema"
import {
    Trade as TradeEvent,
    UpdatePrice as UpdatePriceEvent,
    Liquidate as LiquidateEvent,
    TransferFeeToReferrer as TransferFeeToReferrerEvent,
    TransferFeeToOperator as TransferFeeToOperatorEvent,
    TransferFeeToVault as TransferFeeToVaultEvent,
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
    let lpFee = convertToDecimal(event.params.lpFee, BI_18)
    let position = convertToDecimal(event.params.position, BI_18)
    log.debug("user {} PerpIndex {} position {}", [event.params.trader.toHexString(), event.params.perpetualIndex.toString(), position.toString()])
    log.debug("{} convert => position: {}", [event.params.position.toString(), position.toString()])
    marginAccount.position += position

    marginAccount.totalFee += fee
    marginAccount.lpFee += lpFee

    marginAccount.save()
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

export function handleTransferFeeToReferrer(event: TransferFeeToReferrerEvent): void {
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let referralRebate = convertToDecimal(event.params.referralRebate, BI_18)
    marginAccount.referralRebate += referralRebate
    marginAccount.save()
}

export function handleTransferFeeToOperator(event: TransferFeeToOperatorEvent): void {
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let operatorFee = convertToDecimal(event.params.operatorFee, BI_18)
    let operatorAddress = event.params.operator.toHexString()
    log.debug("user {} PerpIndex {} operatorAddress {}", [event.params.trader.toHexString(), event.params.perpetualIndex.toString(), operatorAddress])
    if (operatorAddress == '0xcfa46e1b666fd91bf39028055d506c1e4ca5ad6e') {
        // bsc: MCDEX dao operator
        marginAccount.operatorFee += operatorFee
    } else if (operatorAddress == '0xa2aad83466241232290bebcd43dcbff6a7f8d23a') {
        // arb-rinkeby: test operator
        marginAccount.operatorFee += operatorFee
    }
    marginAccount.save()
}

export function handleTransferFeeToVault(event: TransferFeeToVaultEvent): void {
    let user = fetchUser(event.params.trader)
    let marginAccount = fetchMarginAccount(user, event.address, event.params.perpetualIndex)
    let vaultFee = convertToDecimal(event.params.vaultFee, BI_18)
    marginAccount.vaultFee += vaultFee
    marginAccount.save()
}