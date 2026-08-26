import { getSessionUser } from "./auth";
import { getOrCreateGuestId } from "./guest";

// Exactly one of (userId, guestId) is ever set — a signed-in user's
// conversations are never keyed by their (still-present) guest cookie.
export type ChatOwner = { userId: string; guestId: null } | { userId: null; guestId: string };

export async function resolveChatOwner(): Promise<ChatOwner> {
  const user = await getSessionUser();
  if (user) return { userId: user.id, guestId: null };
  const guestId = await getOrCreateGuestId();
  return { userId: null, guestId };
}

export function isChatOwner(row: { userId: string | null; guestId: string | null }, owner: ChatOwner): boolean {
  return owner.userId ? row.userId === owner.userId : row.guestId === owner.guestId;
}
