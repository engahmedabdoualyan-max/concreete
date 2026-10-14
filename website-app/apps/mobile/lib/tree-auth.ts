/**
 * Subscription helpers.
 * ===================
 * Sign-in happens exclusively against the ERP API (see store/auth-store.ts).
 * This file used to contain a Firestore "app-tree" login that listed every
 * company tree and compared a password hash inside the client. It was removed
 * because it is only safe while the Firestore rules deny public reads, and any
 * future relaxation of those rules would turn it into an account-takeover path.
 * The website app keeps its own tree authentication in website-app/src/api.
 */

import type { AuthUser } from "@/types";

/** True when the company's subscription is set and has ended. */
export function isSubscriptionExpired(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.subscriptionStatus === "expired") return true;
  if (!user.subscriptionEnd) return false;
  const end = new Date(user.subscriptionEnd);
  if (isNaN(end.getTime())) return false;
  return end < new Date();
}
