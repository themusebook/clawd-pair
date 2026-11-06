import mints from "./mints.json";
const env = import.meta.env;
export const MAINNET_ENABLED = env.VITE_MAINNET_ENABLED === "true";
const want = (env.VITE_NETWORK || "devnet") as "devnet" | "mainnet" | "local";
export const NETWORK = want === "mainnet" && !MAINNET_ENABLED ? "devnet" : want;
const ORIGIN = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
// Mainnet goes through the same-origin server proxy (server.mjs) so the RPC key never ships to the browser.
export const PROXY_RPC = `${ORIGIN}/rpc`;
export const PROXY_WS = `${ORIGIN.replace(/^http/, "ws")}/ws`;
export const RPC_URL = env.VITE_RPC_URL || (NETWORK === "local" ? "http://127.0.0.1:8899" : NETWORK === "mainnet" ? PROXY_RPC : "https://api.devnet.solana.com");
export const WS_URL = NETWORK === "mainnet" && !env.VITE_RPC_URL ? PROXY_WS : undefined;
export const CLAWD_MAINNET = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
// On devnet, test coin "A" stands in for $CLAWD (SOL -> A -> NEW mirrors SOL -> CLAWD -> NEW).
export const CLAWD_MINT = env.VITE_CLAWD_MINT || (NETWORK === "mainnet" ? CLAWD_MAINNET : mints.A);
export const COIN_MINT = env.VITE_COIN_MINT || (NETWORK === "mainnet" ? "" : mints.B);
export const LAUNCH_AT = env.VITE_LAUNCH_AT || "2026-10-31T16:20:00-04:00"; // ISO date (default 4:20 PM EDT, Oct 31 2026)
export const COIN = { name: "Pinch", ticker: "PINCH", tagline: "The first claw the CLAWD grew." };
export const explorer = (kind: "tx" | "address", id: string) => `https://explorer.solana.com/${kind}/${id}${NETWORK === "mainnet" ? "" : NETWORK === "local" ? "?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899" : "?cluster=devnet"}`;
