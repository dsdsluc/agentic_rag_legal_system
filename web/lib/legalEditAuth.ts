import { getSessionUser, SessionUser } from "./auth";

// Admins get it implicitly; canEditLegalDocs grants the same capability to
// someone who isn't a full admin (see prisma/schema.prisma for why that's a
// separate flag rather than a second role).
export function canEditLegalContent(user: SessionUser | null): boolean {
  return !!user && (user.role === "admin" || user.canEditLegalDocs);
}

export async function requireLegalEditor(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return canEditLegalContent(user) ? user : null;
}
