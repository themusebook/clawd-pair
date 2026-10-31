// node --test test/  (no network: GitHub and RPC are mocked)
import test from "node:test"; import assert from "node:assert";
import { parseFrontmatter, normalizeSimd, renderMarkdown, decodeFeature, makeSimd, loadSpec } from "../server/simd.mjs";

const SAMPLE = `---
simd: '0096'
title: Reward full priority fee to validator
authors:
  - Tao Zhu
  - Someone Else (Org)
category: Standard
type: Core
status: Activated
created: 2023-12-18
feature: 3opE3EzAKnUftUDURkzMgwpNgimBAypW1mNDYH4x4Zg7 (https://github.com/solana-labs/solana/issues/34731)
---

## Summary

Reward 100% of priority fee to validator. <script>alert(1)</script>
`;

test("frontmatter: scalars, quoted number, author list, feature id extraction", () => {
  const { meta, body } = parseFrontmatter(SAMPLE);
  assert.equal(meta.simd, "0096"); assert.deepEqual(meta.authors, ["Tao Zhu", "Someone Else (Org)"]); assert.match(body, /^\n## Summary/);
  const s = normalizeSimd("0096-reward.md", SAMPLE);
  assert.equal(s.num, "0096"); assert.equal(s.status, "Activated"); assert.equal(s.category, "Standard"); assert.equal(s.type, "Core"); assert.equal(s.created, "2023-12-18");
  assert.equal(s.feature, "3opE3EzAKnUftUDURkzMgwpNgimBAypW1mNDYH4x4Zg7");
});

test("frontmatter: placeholders give no feature, missing frontmatter falls back to filename", () => {
  const s = normalizeSimd("0123-x.md", "---\nsimd: '0123'\ntitle: T\nstatus: review\nfeature: (fill in with feature tracking issues once accepted)\n---\nbody");
  assert.equal(s.feature, null); assert.equal(s.status, "Review");
  const n = normalizeSimd("0042-no-fm.md", "# hi"); assert.equal(n.num, "0042"); assert.deepEqual(n.authors, []);
});

test("markdown renderer escapes HTML and drops unsafe links", () => {
  const h = renderMarkdown("x <script>alert(1)</script> [a](javascript:alert(1)) [b](https://ok.example) <img src=x onerror=y>\n\n```\n<b>\n```");
  assert.doesNotMatch(h, /<script|<img|javascript:/i); assert.match(h, /&lt;script&gt;/); assert.match(h, /href="https:\/\/ok.example"/); assert.match(h, /<pre><code>&lt;b&gt;/);
  assert.match(renderMarkdown("[r](./0001-x.md)", { base: "https://g/" }), /href="https:\/\/g\/0001-x.md"/);
});

test("feature account decoding", () => {
  const owner = "Feature111111111111111111111111111111111111";
  const d = Buffer.alloc(9); d[0] = 1; d.writeBigUInt64LE(123456n, 1);
  assert.deepEqual(decodeFeature({ owner, data: [d.toString("base64"), "base64"] }), { state: "active", slot: 123456 });
  assert.deepEqual(decodeFeature({ owner, data: [Buffer.alloc(9).toString("base64"), "base64"] }), { state: "pending" });
  assert.deepEqual(decodeFeature(null), { state: "inactive" }); assert.deepEqual(decodeFeature({ owner: "x", data: [""] }), { state: "unknown" });
});

test("handler: list + detail with cache, RPC failure is 'unknown'", async () => {
  let gh = 0; const fetchImpl = async (u, init) => {
    const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => j });
    if (u.includes("/contents/proposals")) { gh++; return ok([{ type: "file", name: "0096-reward.md" }]); }
    if (u.includes("raw.githubusercontent")) return ok(SAMPLE);
    if (u.includes("/pulls")) return ok([{ number: 9, title: "SIMD-0096: tweak", html_url: "https://gh/9" }]);
    if (u.includes("mainnet")) { const d = Buffer.alloc(9); d[0] = 1; return ok({ result: { value: [{ owner: "Feature111111111111111111111111111111111111", data: [d.toString("base64"), "base64"] }] } }); }
    throw new Error("rpc down"); };
  const h = makeSimd({ fetchImpl, token: "" }); let out;
  const res = {}; const json = (_r, c, b) => { out = { c, b }; };
  await h({}, res, new URL("http://x/api/simd"), { json }); await h({}, res, new URL("http://x/api/simd"), { json });
  assert.equal(gh, 1); assert.equal(out.b.simds[0].featureStatus.mainnet.state, "active"); assert.equal(out.b.simds[0].featureStatus.devnet.state, "unknown");
  assert.ok(out.b.simds[0].sections.some((s) => s.id === "fees"));
  await h({}, res, new URL("http://x/api/simd/96"), { json });
  assert.equal(out.c, 200); assert.doesNotMatch(out.b.html, /<script/); assert.equal(out.b.prs[0].number, 9);
  await h({}, res, new URL("http://x/api/simd/spec"), { json }); assert.equal(out.b.sections.length, 13); assert.match(out.b.disclaimer, /Not affiliated/);
});

test("spec files load and every section cites SIMDs as 4-digit ids", () => {
  const s = loadSpec(); assert.equal(s.sections.length, 13);
  for (const sec of s.sections) { assert.ok(sec.markdown.length > 50, sec.id); for (const n of sec.simds) assert.match(n, /^\d{4}$/); }
});

test("normative only when Activated and mainnet gate does not contradict", async () => {
  const { isLive } = await import("../server/simd.mjs");
  assert.equal(isLive("Activated", "active"), true); assert.equal(isLive("Activated", "none"), true); assert.equal(isLive("Activated", "unknown"), true);
  assert.equal(isLive("Activated", "inactive"), false); assert.equal(isLive("Review", "active"), false);
});

test("list falls back to bundled file list when the GitHub API is rate limited", async () => {
  const fetchImpl = async (u) => { if (u.includes("api.github.com")) return { ok: false, status: 403, json: async () => ({}) };
    if (u.includes("raw.githubusercontent")) return { ok: true, status: 200, text: async () => SAMPLE }; throw new Error("rpc down"); };
  let out; await makeSimd({ fetchImpl })({}, {}, new URL("http://x/api/simd?features=0"), { json: (_r, c, b) => { out = { c, b }; } });
  assert.equal(out.c, 200); assert.equal(out.b.source, "snapshot-file-list"); assert.ok(out.b.simds.length > 100);
});
