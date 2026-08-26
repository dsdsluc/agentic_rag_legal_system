import { prisma } from "./prisma";
import { clearGuestCookie, getGuestId } from "./guest";

// Reassigns an anonymous visitor's chat history to the account they just
// logged into or registered — read-only lookup first so a visitor who never
// chatted (no cookie) doesn't cost a write.
export async function claimGuestConversations(userId: string): Promise<void> {
  const guestId = await getGuestId();
  if (!guestId) return;

  await prisma.conversation.updateMany({
    where: { guestId },
    data: { userId, guestId: null },
  });
  await clearGuestCookie();
}
