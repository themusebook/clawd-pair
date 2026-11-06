import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  submissions: defineTable({
    wallet: v.string(), note: v.string(), verified: v.boolean(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    createdAt: v.number(), ipHash: v.string(),
  }).index("by_wallet", ["wallet"]).index("by_status", ["status"]),
});
