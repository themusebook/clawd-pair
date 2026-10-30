import { PublicKey } from "@solana/web3.js";
const P=(s,seeds)=>PublicKey.findProgramAddressSync(seeds.map(x=>typeof x==="string"?Buffer.from(x):x.toBuffer?x.toBuffer():x),new PublicKey(s))[0].toBase58();
const PUMP="6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",AMM="pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",FEE="pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
console.log([P(PUMP,["global"]),P(PUMP,["global_volume_accumulator"]),P(PUMP,["quote-control"]),P(AMM,["global_config"]),P(AMM,["global_volume_accumulator"]),P(FEE,["fee_config",new PublicKey(PUMP)]),P(FEE,["fee_config",new PublicKey(AMM)]),P(PUMP,["global-params"])].join(" "));
