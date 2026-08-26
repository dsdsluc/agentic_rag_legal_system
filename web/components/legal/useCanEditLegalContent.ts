"use client";

import { useAuth } from "@/lib/auth-client";

export function useCanEditLegalContent(): boolean {
  const { user } = useAuth();
  return !!user && (user.role === "admin" || user.canEditLegalDocs);
}
