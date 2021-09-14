import { TypedMap } from '@graphprotocol/graph-ts'

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let MCB_ADDRESS = "0x4e352cf164e64adcbad318c3a1e222e9eba4ce42"

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let OracleMap = new TypedMap<string, string>();
OracleMap.set("0x4e352cf164e64adcbad318c3a1e222e9eba4ce42", "0xe9727d80F0A0b8c7372a3e5820b6802FADb1E83B")


// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let ReferrerWhiteList:string[] = [
]

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
// added ["USDC"]
export let USDTokens:string[] = [
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
]

// certified pool address to name
export let CertifiedPools = new TypedMap<string, string>();
CertifiedPools.set("0xab324146c49b23658e5b3930e641bdbdf089cbac", "USDC Pool")