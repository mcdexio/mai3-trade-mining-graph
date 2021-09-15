import {TradeMiningDayData} from "../generated/schema";
import {BigInt, BigDecimal, ethereum, log, Address} from "@graphprotocol/graph-ts"
import {CertifiedPools} from "./const";

export function updateTradeMiningDayData(pool: string, timestamp: BigInt, amount: BigDecimal, price: BigDecimal): TradeMiningDayData {
    let dayIndex = timestamp.toI32() / (3600 * 24)
    let dayStartUnix = dayIndex * (3600 * 24)
    let dayTradeMiningID = pool
        .concat('-')
        .concat(BigInt.fromI32(dayIndex).toString())
    let tradeMiningDayData = TradeMiningDayData.load(dayTradeMiningID)
    if (tradeMiningDayData === null) {
        tradeMiningDayData = new TradeMiningDayData(dayTradeMiningID)
        tradeMiningDayData.pool = pool
        tradeMiningDayData.poolName = CertifiedPools.get(pool) as string
        tradeMiningDayData.token = "MCB"
        tradeMiningDayData.timestamp = dayStartUnix
        tradeMiningDayData.minedAmount = amount
        tradeMiningDayData.minedValueUSD = amount.times(price)
    } else {
        tradeMiningDayData.minedAmount = tradeMiningDayData.minedAmount.plus(amount)
        tradeMiningDayData.minedValueUSD = tradeMiningDayData.minedValueUSD.plus(amount.times(price))
    }
    tradeMiningDayData.save()
    return tradeMiningDayData as TradeMiningDayData
}
