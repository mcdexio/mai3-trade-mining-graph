import { BigDecimal, BigInt, ethereum, store } from '@graphprotocol/graph-ts'
import {
  Swap as SwapEvent
} from '../generated/MCB-ETH/UniswapPool'
import { BI_18, BI_6, exponentToBigDecimal, ZERO_BD } from './utils'

import {UniswapPriceBucket} from "../generated/schema"


// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
    if (amount1.equals(ZERO_BD)) {
        return ZERO_BD
    } else {
        return amount0.div(amount1)
    }
}

let Q192 = 2 ** 192
export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: BigInt, decimal1: BigInt, decimal2: BigInt): BigDecimal[] {
  let num = sqrtPriceX96.times(sqrtPriceX96).toBigDecimal()
  let denom = BigDecimal.fromString(Q192.toString())
  let price1 = num
    .div(denom)
    .times(exponentToBigDecimal(decimal1))
    .div(exponentToBigDecimal(decimal2))

  let price0 = safeDiv(BigDecimal.fromString('1'), price1)
  return [price0, price1]
}

export function handleMCBETHSwap(event: SwapEvent): void {
    let prices = sqrtPriceX96ToTokenPrices(event.params.sqrtPriceX96, BI_18, BI_18)
    let mcbToEthPrice = prices[1]
    let timestamp = event.block.timestamp.toI32()
    let hourTime = (timestamp / 3600) * 3600

    let id = event.address.toHexString()
    let priceBucket = UniswapPriceBucket.load(id)
    if (priceBucket == null) {
        priceBucket = new UniswapPriceBucket(id)
        priceBucket.priceAvgHour = mcbToEthPrice
        priceBucket.priceLast = mcbToEthPrice
        priceBucket.hourTimestamp = hourTime
        priceBucket.timestampLast = timestamp
        priceBucket.accPt = ZERO_BD
        priceBucket.accT = ZERO_BD
    } else {
        if (hourTime > priceBucket.hourTimestamp) {
            let acc_pt = priceBucket.accPt.plus(priceBucket.priceLast.times(BigInt.fromI32(hourTime-priceBucket.timestampLast).toBigDecimal()))
            let acc_t = BigInt.fromI32(hourTime-priceBucket.timestampLast).toBigDecimal()
            priceBucket.priceAvgHour = acc_pt.div(acc_t)
            priceBucket.hourTimestamp = hourTime
            priceBucket.timestampLast = timestamp
            priceBucket.priceLast = mcbToEthPrice
            priceBucket.accPt = ZERO_BD
            priceBucket.accT = ZERO_BD
        } else {
            if (timestamp > priceBucket.timestampLast) {
                let acc_pt = priceBucket.accPt.plus(priceBucket.priceLast.times(BigInt.fromI32(timestamp-priceBucket.timestampLast).toBigDecimal()))
                let acc_t = BigInt.fromI32(timestamp-priceBucket.timestampLast).toBigDecimal()
                priceBucket.timestampLast = timestamp
                priceBucket.priceLast = mcbToEthPrice
                priceBucket.accPt = acc_pt
                priceBucket.accT = acc_t
            }
        }
    }
    priceBucket.save()
}

export function handleETHUSDCSwap(event: SwapEvent): void {
    let prices = sqrtPriceX96ToTokenPrices(event.params.sqrtPriceX96, BI_18, BI_6)
    let ethToUsdcPrice = prices[1]
    let timestamp = event.block.timestamp.toI32()
    let hourTime = (timestamp / 3600) * 3600

    let id = event.address.toHexString()
    let priceBucket = UniswapPriceBucket.load(id)
    if (priceBucket == null) {
        priceBucket = new UniswapPriceBucket(id)
        priceBucket.priceAvgHour = ethToUsdcPrice
        priceBucket.priceLast = ethToUsdcPrice
        priceBucket.hourTimestamp = hourTime
        priceBucket.timestampLast = timestamp
        priceBucket.accPt = ZERO_BD
        priceBucket.accT = ZERO_BD
    } else {
        if (hourTime > priceBucket.hourTimestamp) {
            let acc_pt = priceBucket.accPt.plus(priceBucket.priceLast.times(BigInt.fromI32(hourTime-priceBucket.timestampLast).toBigDecimal()))
            let acc_t = BigInt.fromI32(hourTime-priceBucket.timestampLast).toBigDecimal()
            priceBucket.priceAvgHour = acc_pt.div(acc_t)
            priceBucket.hourTimestamp = hourTime
            priceBucket.timestampLast = timestamp
            priceBucket.priceLast = ethToUsdcPrice
            priceBucket.accPt = ZERO_BD
            priceBucket.accT = ZERO_BD
        } else {
            if (timestamp > priceBucket.timestampLast) {
                let acc_pt = priceBucket.accPt.plus(priceBucket.priceLast.times(BigInt.fromI32(timestamp-priceBucket.timestampLast).toBigDecimal()))
                let acc_t = BigInt.fromI32(timestamp-priceBucket.timestampLast).toBigDecimal()
                priceBucket.timestampLast = timestamp
                priceBucket.priceLast = ethToUsdcPrice
                priceBucket.accPt = acc_pt
                priceBucket.accT = acc_t
            }
        }
    }
    priceBucket.save()
}

export function getMCBPrice(): BigDecimal {
    let mcbToEthPriceBucket = UniswapPriceBucket.load("0xdcc3ac7668d46f44434bf1ffe57a37e25ca3acf3")
    let mcbToEthPrice = mcbToEthPriceBucket.priceAvgHour
    let ethToUsdcPriceBucket = UniswapPriceBucket.load("0x17c14d2c404d167802b16c450d3c99f88f2c4f4d")
    let ethToUsdcPrice = ethToUsdcPriceBucket.priceAvgHour
    return mcbToEthPrice.times(ethToUsdcPrice)
}
