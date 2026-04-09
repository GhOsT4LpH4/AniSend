import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Sync a deal from the blockchain into Convex for real-time queries */
export const syncDeal = mutation({
  args: {
    dealId: v.float64(),
    contractId: v.string(),
    sellerAddress: v.string(),
    buyerAddress: v.string(),
    amountUsd: v.float64(),
    description: v.string(),
    invoiceRef: v.optional(v.string()),
    eventDetails: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deals")
      .withIndex("by_dealId", (q) => q.eq("dealId", args.dealId))
      .unique();

    // Convex is a cache/index, not an authority: do not store or mutate on-chain status here.
    if (!existing) {
      await ctx.db.insert("deals", {
        dealId: args.dealId,
        contractId: args.contractId,
        sellerAddress: args.sellerAddress,
        buyerAddress: args.buyerAddress,
        amountUsd: args.amountUsd,
        description: args.description,
        invoiceRef: args.invoiceRef,
      });
    }

    await ctx.db.insert("activity_logs", {
      dealId: args.dealId,
      userAddress: args.sellerAddress,
      eventType: "DEAL_CREATED",
      details: args.eventDetails,
      createdAt: Date.now(),
    });
  },
});

/** Record an interaction on a deal (status is read from chain in the UI). */
export const logDealEvent = mutation({
  args: {
    dealId: v.float64(),
    userAddress: v.string(),
    eventDetails: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activity_logs", {
      dealId: args.dealId,
      userAddress: args.userAddress,
      eventType: args.eventType,
      details: args.eventDetails,
      createdAt: Date.now(),
    });
  },
});

/** One-time migration: backfill missing deal.contractId for legacy rows. */
export const migrateDealsBackfillContractId = mutation({
  args: { legacyContractId: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("deals").collect();
    const missing = all.filter((d: any) => !d.contractId);
    for (const d of missing as any[]) {
      await ctx.db.patch(d._id, { contractId: args.legacyContractId } as any);
    }
    return { total: all.length, backfilled: missing.length, legacyContractId: args.legacyContractId };
  },
});

/** Same migration, but no JSON args needed (PowerShell-friendly). */
export const migrateDealsBackfillContractIdLegacy = mutation({
  args: {},
  handler: async (ctx) => {
    const legacyContractId = "LEGACY";
    const all = await ctx.db.query("deals").collect();
    const missing = all.filter((d: any) => !d.contractId);
    for (const d of missing as any[]) {
      await ctx.db.patch(d._id, { contractId: legacyContractId } as any);
    }
    return { total: all.length, backfilled: missing.length, legacyContractId };
  },
});

/** List all deals where the user is either buyer or seller */
export const listMyDeals = query({
  args: { userAddress: v.string(), contractId: v.string() },
  handler: async (ctx, args) => {
    const asSeller = await ctx.db
      .query("deals")
      .withIndex("by_contract_seller", (q) => q.eq("contractId", args.contractId).eq("sellerAddress", args.userAddress))
      .collect();

    const asBuyer = await ctx.db
      .query("deals")
      .withIndex("by_contract_buyer", (q) => q.eq("contractId", args.contractId).eq("buyerAddress", args.userAddress))
      .collect();

    const all = [...asSeller, ...asBuyer];
    return all.filter((v, i, a) => a.findIndex((t) => t.dealId === v.dealId) === i);
  },
});

/** Get recent activity for a user */
export const getMyActivity = query({
  args: { userAddress: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activity_logs")
      .withIndex("by_user", (q) => q.eq("userAddress", args.userAddress))
      .order("desc")
      .take(args.limit);
  },
});

/** One-time cleanup: remove legacy `status` field from deals rows. */
export const cleanupLegacyDealStatus = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("deals").collect();
    const withStatus = all.filter((d: any) => typeof d.status === "string");

    for (const d of withStatus as any[]) {
      // Convex removes optional fields when set to undefined.
      await ctx.db.patch(d._id, { status: undefined } as any);
    }

    // Recheck
    const all2 = await ctx.db.query("deals").collect();
    const still = all2.filter((d: any) => typeof d.status === "string").length;

    return { total: all.length, removedFrom: withStatus.length, remainingWithStatus: still };
  },
});
