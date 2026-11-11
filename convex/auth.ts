import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth/minimal";
import { anonymous } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * Everyone starts as an anonymous guest, so they can play straight away.
 * Signing up (or in) with email and password from a guest session moves
 * the guest's player over, or keeps the account's existing player.
 */
export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true, requireEmailVerification: false, minPasswordLength: 8 },
    plugins: [
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await requireRunMutationCtx(ctx).runMutation(internal.players.relink, {
            from: anonymousUser.user.id,
            to: newUser.user.id,
          });
        },
      }),
      convex({ authConfig }),
    ],
  });
