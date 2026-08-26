import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { Role } from "./generated/prisma/enums";

// Server-only — never import this from a client component. Sessions are
// DB-backed opaque tokens (not JWT): the cookie holds a random token, only
// its SHA-256 lives in Postgres, so a DB leak alone can't be replayed, and
// logout/expiry is a plain row delete rather than a signature story.

export const SESSION_COOKIE = "session_token";
const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 12;

// Constant-shape compare target for a login against an email that doesn't
// exist, so "no such user" and "wrong password" take the same time.
const DUMMY_HASH = bcrypt.hashSync("no-such-account-timing-guard", BCRYPT_ROUNDS);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  canEditLegalDocs: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

// Exported so the password-change route can revoke every *other* session
// for the same user without duplicating the hashing logic.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  // isLocked is also enforced by revoking sessions at lock-time — this is
  // a defense-in-depth check for the unlikely case a session outlives that.
  if (!session || session.expiresAt < new Date() || session.user.isLocked) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    canEditLegalDocs: session.user.canEditLegalDocs,
  };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
