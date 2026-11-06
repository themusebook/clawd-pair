// Airdrop consideration submissions. Every function requires SUBMIT_SECRET (Convex env), so only the pinch server can call them.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
const guard = (s: string) => { if (!process.env.SUBMIT_SECRET || s !== process.env.SUBMIT_SECRET) throw new Error("unauthorized"); };

export const submit = mutation({
  args: { secret: v.string(), wallet: v.string(), note: v.string(), verified: v.boolean(), ipHash: v.string() },
  handler: async (ctx, a) => {
    guard(a.secret);
    const ex = await ctx.db.query("submissions").withIndex("by_wallet", (q) => q.eq("wallet", a.wallet)).unique();
    if (ex) { if (a.verified && !ex.verified) await ctx.db.patch(ex._id, { verified: true }); return { duplicate: true, status: ex.status, verified: ex.verified || a.verified, createdAt: ex.createdAt }; }
    const createdAt = Date.now();
    await ctx.db.insert("submissions", { wallet: a.wallet, note: a.note, verified: a.verified, status: "pending", createdAt, ipHash: a.ipHash });
    return { duplicate: false, status: "pending", verified: a.verified, createdAt };
  },
});
export const get = query({
  args: { secret: v.string(), wallet: v.string() },
  handler: async (ctx, a) => { guard(a.secret); const r = await ctx.db.query("submissions").withIndex("by_wallet", (q) => q.eq("wallet", a.wallet)).unique(); return r ? { wallet: r.wallet, status: r.status, verified: r.verified, createdAt: r.createdAt } : null; },
});
export const list = query({
  args: { secret: v.string(), status: v.optional(v.string()) },
  handler: async (ctx, a) => { guard(a.secret); const rows = await ctx.db.query("submissions").order("desc").take(5000); return rows.filter((r) => !a.status || r.status === a.status).map(({ _id, _creationTime, ...r }) => r); },
});
export const setStatus = mutation({
  args: { secret: v.string(), wallet: v.string(), status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")) },
  handler: async (ctx, a) => { guard(a.secret); const r = await ctx.db.query("submissions").withIndex("by_wallet", (q) => q.eq("wallet", a.wallet)).unique(); if (!r) return null; await ctx.db.patch(r._id, { status: a.status }); return { wallet: a.wallet, status: a.status }; },
});
