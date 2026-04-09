import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Get or create a farmer/user profile on first wallet connection */
export const getOrCreateUser = mutation({
  args: {
    stellarAddress: v.string(),
    farmerName: v.optional(v.string()),
    province: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_address", (q) => q.eq("stellarAddress", args.stellarAddress))
      .unique();

    if (existingUser) return existingUser;

    const userId = await ctx.db.insert("users", {
      stellarAddress: args.stellarAddress,
      farmerName: args.farmerName || "Magsasaka",
      province: args.province || "Nueva Ecija",
    });

    await ctx.db.insert("activity_logs", {
      userAddress: args.stellarAddress,
      eventType: "USER_REGISTERED",
      details: `Farmer profile created: ${args.farmerName || "Magsasaka"}`,
      createdAt: Date.now(),
    });

    return await ctx.db.get(userId);
  },
});

/** Update user profile */
export const updateProfile = mutation({
  args: {
    stellarAddress: v.string(),
    farmerName: v.string(),
    province: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_address", (q) => q.eq("stellarAddress", args.stellarAddress))
      .unique();

    if (!user) throw new Error("User not found.");

    await ctx.db.patch(user._id, {
      farmerName: args.farmerName,
      province: args.province,
    });
  },
});

/** Read user profile by Stellar address */
export const getUser = query({
  args: { stellarAddress: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_address", (q) => q.eq("stellarAddress", args.stellarAddress))
      .unique();
  },
});
