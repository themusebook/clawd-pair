import { Connection } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import fs from "fs";
const c = new Connection(fs.readFileSync(new URL("../devnet-test/rpc.url", import.meta.url), "utf8").trim());
const s = new OnlinePumpSdk(c);
const g = await s.fetchGlobal();
const pick = ["initialVirtualTokenReserves","initialVirtualSolReserves","initialRealTokenReserves","tokenTotalSupply","feeBasisPoints","poolMigrationFee","maxCurveDepth","createV2Enabled"];
for (const k of Object.keys(g)) if (pick.includes(k) || /depth|quote/i.test(k)) console.log(k, g[k]?.toString?.() ?? g[k]);
try { console.log("supportedQuoteMints", (await s.fetchSupportedQuoteMints()).map(x=>x.toBase58?.()??JSON.stringify(x))); } catch(e){console.log("sqm err", e.message)}
