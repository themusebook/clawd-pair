// Usage: bun scripts/approve-log.ts <id> [--revoke]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const file = resolve(import.meta.dirname ?? __dirname, "../app/src/lib/buildlog.json");
const [id, flag] = process.argv.slice(2);
if (!id) { console.error("usage: approve-log.ts <id> [--revoke]"); process.exit(1); }
const log = JSON.parse(readFileSync(file, "utf8")) as { id: string; approved: boolean }[];
const e = log.find(x => x.id === id);
if (!e) { console.error(`no entry with id ${id}`); process.exit(1); }
e.approved = flag !== "--revoke";
writeFileSync(file, JSON.stringify(log, null, 2) + "\n");
console.log(`${id}: approved=${e.approved}`);
