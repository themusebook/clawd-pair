import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
export default defineConfig({ plugins: [react(), nodePolyfills({ include: ["buffer", "crypto", "stream", "util", "process"] })], server: { host: true, port: 5173 }, preview: { host: true, port: Number(process.env.PORT) || 4173, allowedHosts: true } });
