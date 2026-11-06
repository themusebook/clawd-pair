FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_NETWORK=devnet
ARG VITE_MAINNET_ENABLED=false
ARG VITE_RPC_URL=
ARG VITE_COIN_MINT=
ARG VITE_CLAWD_MINT=
ARG VITE_LAUNCH_AT=2026-10-31T16:20:00-04:00
ENV VITE_NETWORK=$VITE_NETWORK VITE_MAINNET_ENABLED=$VITE_MAINNET_ENABLED VITE_RPC_URL=$VITE_RPC_URL VITE_COIN_MINT=$VITE_COIN_MINT VITE_CLAWD_MINT=$VITE_CLAWD_MINT VITE_LAUNCH_AT=$VITE_LAUNCH_AT
RUN bunx vite build
FROM node:22-slim
WORKDIR /app
RUN npm i --no-save --no-package-lock ws@8 @noble/curves@1.9.7 convex@1 @solana/web3.js@1 @solana/spl-token@0.4 >/dev/null
COPY server.mjs ./
COPY server ./server
COPY spec ./spec
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
# RPC_URL / WSS_URL / ACCESS_TOKEN are runtime env only (never build args) so they never reach the bundle.
CMD ["node","server.mjs"]
