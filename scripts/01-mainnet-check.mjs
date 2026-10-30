// Read-only mainnet check: does CLAWD have a pump bonding-curve PDA, and its canonical PumpSwap pool?
import { Connection, PublicKey } from "@solana/web3.js";
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const CLAWD = new PublicKey("8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump");
const c = new Connection("https://api.mainnet-beta.solana.com");
const [bc] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), CLAWD.toBuffer()], PUMP);
const [pa] = PublicKey.findProgramAddressSync([Buffer.from("pool-authority"), CLAWD.toBuffer()], PUMP);
const idx = Buffer.alloc(2);
const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool"), idx, pa.toBuffer(), CLAWD.toBuffer(), WSOL.toBuffer()], AMM);
for (const [n, k] of [["bonding_curve", bc], ["pool_authority", pa], ["canonical_pool", pool]]) {
  const a = await c.getAccountInfo(k);
  console.log(n, k.toBase58(), a ? `exists owner=${a.owner.toBase58()} len=${a.data.length}` : "MISSING");
  if (n === "bonding_curve" && a) console.log("  complete flag byte:", a.data[8 + 40]);
}
