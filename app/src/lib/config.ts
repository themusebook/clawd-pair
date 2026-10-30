import mints from "./mints.json";
const env = import.meta.env;
export const MAINNET_ENABLED = env.VITE_MAINNET_ENABLED === "true";
const want = (env.VITE_NETWORK || "devnet") as "devnet" | "mainnet" | "local";
export const NETWORK = want === "mainnet" && !MAINNET_ENABLED ? "devnet" : want;
export const RPC_URL = env.VITE_RPC_URL || (NETWORK === "local" ? "http://127.0.0.1:8899" : NETWORK === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");
export const CLAWD_MAINNET = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
// On devnet, test coin "A" stands in for $CLAWD (SOL -> A -> NEW mirrors SOL -> CLAWD -> NEW).
export const CLAWD_MINT = env.VITE_CLAWD_MINT || (NETWORK === "mainnet" ? CLAWD_MAINNET : mints.A);
export const COIN_MINT = env.VITE_COIN_MINT || (NETWORK === "mainnet" ? "" : mints.B);
export const LAUNCH_AT = env.VITE_LAUNCH_AT || ""; // ISO date; empty = "awaiting owner approval"
export const COIN = { name: "Pinch", ticker: "PINCH", tagline: "The first claw the CLAWD grew." };
export const explorer = (kind: "tx" | "address", id: string) => `https://explorer.solana.com/${kind}/${id}${NETWORK === "mainnet" ? "" : NETWORK === "local" ? "?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899" : "?cluster=devnet"}`;
