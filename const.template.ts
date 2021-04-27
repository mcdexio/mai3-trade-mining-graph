// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let MCB_ADDRESS = "{{mcb_address}}"

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
// TokenList: tokens need to get price
export let TokenList:string[] = [
  "{{mcb_address}}",
  "{{eth_address}}"
]
// OracleList: oracles of each token upper, Notice: index must same with its token
export let OracleList:string[] = [
  "{{mcb_oracle}}",
  "{{eth_oracle}}"
]


// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
export let ReferrerWhiteList:string[] = [
]

// !!!!!!!!!!!!!!  Notice Lower Case  !!!!!!!!!!!!!!
// added ["USDC"]
export let USDTokens:string[] = [
  "{{usdc_address}}",
]