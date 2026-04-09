import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 1. User Profiles
  users: defineTable({
    stellarAddress: v.string(),
    farmerName: v.optional(v.string()),
    province: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }).index("by_address", ["stellarAddress"]),

  // 2. Livestock Deals
  deals: defineTable({
    dealId: v.float64(),
    sellerAddress: v.string(),
    buyerAddress: v.string(),
    amountUsd: v.float64(),
    description: v.string(),            // e.g. "carabao", "goat"
    status: v.string(),                 // matches DealStatus
    invoiceRef: v.optional(v.string()),
  })
  .index("by_dealId", ["dealId"])
  .index("by_seller", ["sellerAddress"])
  .index("by_buyer", ["buyerAddress"]),

  // 3. Activity Logs
  activity_logs: defineTable({
    dealId: v.optional(v.float64()),
    userAddress: v.string(),
    eventType: v.string(),
    details: v.string(),
    createdAt: v.float64(),
  }).index("by_user", ["userAddress"]),
});
