import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Sync a deal from the blockchain into Convex for real-time queries */
export const syncDeal = mutation({
  args: {
    dealId: v.float64(),
    sellerAddress: v.string(),
    buyerAddress: v.string(),
    amountUsd: v.float64(),
    description: v.string(),
    status: v.string(),
    invoiceRef: v.optional(v.string()),
    eventDetails: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deals")
      .withIndex("by_dealId", (q) => q.eq("dealId", args.dealId))
      .unique();

    if (existing) {
      if (existing.status !== args.status) {
        await ctx.db.patch(existing._id, { status: args.status });
      }
    } else {
      await ctx.db.insert("deals", {
        dealId: args.dealId,
        sellerAddress: args.sellerAddress,
        buyerAddress: args.buyerAddress,
        amountUsd: args.amountUsd,
        description: args.description,
        status: args.status,
        invoiceRef: args.invoiceRef,
      });
    }

    await ctx.db.insert("activity_logs", {
      dealId: args.dealId,
      userAddress: args.sellerAddress,
      eventType: `DEAL_${args.status.toUpperCase()}`,
      details: args.eventDetails,
      createdAt: Date.now(),
    });
  },
});

/** Update the status of a deal (e.g. after deposit, confirm, cancel) */
export const updateDealStatus = mutation({
  args: {
    dealId: v.float64(),
    status: v.string(),
    userAddress: v.string(),
    eventDetails: v.string(),
  },
  handler: async (ctx, args) => {
    const deal = await ctx.db
      .query("deals")
      .withIndex("by_dealId", (q) => q.eq("dealId", args.dealId))
      .unique();

    if (deal) {
      await ctx.db.patch(deal._id, { status: args.status });
    }

    await ctx.db.insert("activity_logs", {
      dealId: args.dealId,
      userAddress: args.userAddress,
      eventType: `DEAL_${args.status.toUpperCase()}`,
      details: args.eventDetails,
      createdAt: Date.now(),
    });
  },
});

/** List all deals where the user is either buyer or seller */
export const listMyDeals = query({
  args: { userAddress: v.string() },
  handler: async (ctx, args) => {
    const asSeller = await ctx.db
      .query("deals")
      .withIndex("by_seller", (q) => q.eq("sellerAddress", args.userAddress))
      .collect();

    const asBuyer = await ctx.db
      .query("deals")
      .withIndex("by_buyer", (q) => q.eq("buyerAddress", args.userAddress))
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
