import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// Opaque per-browser id for anonymous chat history — never PII, just lets a
// guest's conversations survive a refresh without an account. Read-only
// counterpart of getOrCreateGuestId() for routes that shouldn't mint a new
// cookie just by being visited (e.g. checking whether one exists to claim).
export const GUEST_COOKIE = "guest_id";
const GUEST_TTL_DAYS = 180;

function guestCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: GUEST_TTL_DAYS * 24 * 60 * 60,
  };
}

export async function getOrCreateGuestId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(GUEST_COOKIE, id, guestCookieOptions());
  return id;
}

export async function getGuestId(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value ?? null;
}

export async function clearGuestCookie(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}
