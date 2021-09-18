import { BigDecimal, BigInt, ethereum, store } from '@graphprotocol/graph-ts'
import {
  Swap as SwapEvent
} from './generated/MCB-ETH/UniswapPool'
import { BI_18, BI_6, exponentToBigDecimal, ZERO_BD } from './utils'

import {Swap} from "../generated/schema"


// return 0 if denominator is 0 in division
export function safeDiv(amount0: BigDecimal, amount1: BigDecimal): BigDecimal {
    if (amount1.equals(ZERO_BD)) {
        return ZERO_BD
    } else {
        return amount0.div(amount1)
    }
}

let Q192 = 2 ** 192
export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: BigInt, decimal1: BigDecimal, decimal2: BigDecimal): BigDecimal[] {
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
    let id = event.address.toHexString().concat('-').concat(event.block.number.toString())
    let swap = new Swap(id)
    swap.price0 = prices[0]
    swap.price1 = prices[1]
    swap.block = event.block.number
    swap.save()
}

export function handleETHUSDCSwap(event: SwapEvent): void {
    let prices = sqrtPriceX96ToTokenPrices(event.params.sqrtPriceX96, BI_18, BI_6)
    let id = event.address.toHexString().concat('-').concat(event.block.number.toString())
    let swap = new Swap(id)
    swap.price0 = prices[0]
    swap.price1 = prices[1]
    swap.block = event.block.number
    swap.save()
}