import { getSessionUser, SessionUser } from "./auth";

// Stricter than lib/legalEditAuth.ts on purpose — the admin area can change
// other people's permissions and see the full conversation table, so it's
// role === "admin" only, never the narrower canEditLegalDocs grant.
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "admin" ? user : null;
}
