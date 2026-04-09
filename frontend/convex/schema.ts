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
    // Backward-compat: older rows may not have contractId yet.
    contractId: v.optional(v.string()),
    sellerAddress: v.string(),
    buyerAddress: v.string(),
    amountUsd: v.float64(),
    description: v.string(),            // e.g. "carabao", "goat"
    // Backward-compat: older rows may include status; UI reads status from chain.
    status: v.optional(v.string()),
    invoiceRef: v.optional(v.string()),
  })
  .index("by_dealId", ["dealId"])
  // Indexes for contract-scoped views (rows missing contractId won't match these).
  .index("by_contract", ["contractId"])
  .index("by_contract_seller", ["contractId", "sellerAddress"])
  .index("by_contract_buyer", ["contractId", "buyerAddress"])
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
