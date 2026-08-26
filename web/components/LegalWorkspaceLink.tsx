"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/lib/auth-client";

// Only shown once logged in — /van-ban is gated the same way, so this is
// purely a shortcut for people who already have access, not a promo for
// people who don't.
export function LegalWorkspaceLink() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Link
      href="/van-ban"
      title="Legal Workspace"
      aria-label="Legal Workspace"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
    >
      <BookOpen size={15} />
    </Link>
  );
}
