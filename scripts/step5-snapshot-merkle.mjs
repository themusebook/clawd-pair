// Step 5: snapshot holders of B (and A), compute eligibility, merkle root, verify a proof, then owner-signed
// "claim" payout (SPL transfer + memo carrying root & proof hash). NOTE: not a trustless distributor; see README.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createTransferCheckedInstruction, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import crypto from "crypto"; import fs from "fs";
const RPC = process.env.RPC, CLUSTER = process.env.CLUSTER || "devnet"; if (/mainnet/.test(RPC)) throw 0;
const c = new Connection(RPC, "confirmed");
const { A, B } = JSON.parse(fs.readFileSync(`mints-${CLUSTER}.json`)); const a = new PublicKey(A), b = new PublicKey(B);
const kp = n => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`devnet-test/${n}.json`))));
const owner = kp("owner"), buyer = kp("buyer");
const MIN_B = 1_000_000n; // eligibility: hold >= 1 B token (6 dp) at snapshot slot, exclude PDAs (off-curve owners) = curves/pools
async function holders(mint) {
  const accs = await c.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }] });
  return accs.map(x => x.account.data.parsed.info).map(i => ({ owner: i.owner, amount: BigInt(i.tokenAmount.amount) }));
}
const slot = await c.getSlot();
const hB = (await holders(b)).filter(h => PublicKey.isOnCurve(new PublicKey(h.owner).toBytes()) && h.amount >= MIN_B);
const pool = 1_000_000_000n; // reward pool in A base units, pro-rata to B held
const tot = hB.reduce((s, h) => s + h.amount, 0n);
const leaves = hB.map(h => ({ wallet: h.owner, amount: (pool * h.amount / tot).toString() }));
const H = x => crypto.createHash("sha256").update(x).digest();
const leafHash = l => H(Buffer.concat([Buffer.from([0]), new PublicKey(l.wallet).toBuffer(), Buffer.from(BigInt(l.amount).toString(16).padStart(16, "0"), "hex")]));
const pair = (x, y) => H(Buffer.concat([Buffer.from([1]), ...(Buffer.compare(x, y) <= 0 ? [x, y] : [y, x])]));
let level = leaves.map(leafHash); const layers = [level];
while (level.length > 1) { const n = []; for (let i = 0; i < level.length; i += 2) n.push(i + 1 < level.length ? pair(level[i], level[i + 1]) : level[i]); layers.push(level = n); }
const root = level[0];
const proofFor = i => { const p = []; for (const L of layers.slice(0, -1)) { const j = i ^ 1; if (j < L.length) p.push(L[j]); i >>= 1; } return p; };
const idx = leaves.findIndex(l => l.wallet === buyer.publicKey.toBase58());
const proof = proofFor(idx); const ok = proof.reduce((h, s) => pair(h, s), leafHash(leaves[idx])).equals(root);
const snap = { slot, mintB: B, rule: "hold >= 1 B at slot, on-curve owners only; pro-rata of 1e9 A units", leaves, root: root.toString("hex"), claimant: leaves[idx], proof: proof.map(p => p.toString("hex")), proofValid: ok };
fs.writeFileSync(`snapshot-${CLUSTER}.json`, JSON.stringify(snap, null, 2)); console.log("holders", leaves.length, "root", snap.root, "proofValid", ok);
const from = getAssociatedTokenAddressSync(a, owner.publicKey, false, TOKEN_2022_PROGRAM_ID), to = getAssociatedTokenAddressSync(a, buyer.publicKey, false, TOKEN_2022_PROGRAM_ID);
const memo = new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qNKxyY9Svbrg9qbPj9LNRbE1Ve"), keys: [], data: Buffer.from(`clawd-pair claim root=${snap.root.slice(0, 16)} leaf=${leafHash(leaves[idx]).toString("hex").slice(0, 16)}`) });
const hasMemo = !!(await c.getAccountInfo(memo.programId));
const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, to, buyer.publicKey, a, TOKEN_2022_PROGRAM_ID), createTransferCheckedInstruction(from, a, to, owner.publicKey, BigInt(leaves[idx].amount), 6, [], TOKEN_2022_PROGRAM_ID), ...(hasMemo ? [memo] : []));
const sig = await sendAndConfirmTransaction(c, tx, [owner]);
const outF = `dryrun-${CLUSTER}.json`; const log = JSON.parse(fs.readFileSync(outF));
log.push({ step: "5 snapshot+merkle root+claim payout (owner-signed transfer w/ memo)", sig, root: snap.root, holders: leaves.length, proofValid: ok, url: `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER === "local" ? "custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899" : "devnet"}` });
fs.writeFileSync(outF, JSON.stringify(log, null, 2)); console.log("OK 5", sig);
