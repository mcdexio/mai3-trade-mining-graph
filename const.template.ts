import { TypedMap } from '@graphprotocol/graph-ts'

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let MCB_ADDRESS = "{{mcb_address}}"

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let OracleMap = new TypedMap<string, string>();
OracleMap.set("{{mcb_address}}", "{{mcb_oracle}}")


// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let ReferrerWhiteList:string[] = [
]

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
// added ["USDC"]
export let USDTokens:string[] = [
  "{{usdc_address}}",
]