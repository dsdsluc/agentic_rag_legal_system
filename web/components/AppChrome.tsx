"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { ChatSidebar } from "./ChatSidebar";

const COLLAPSE_KEY = "sidebar-collapsed";

export function AppChrome({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Reads localStorage once after mount so the server-rendered (expanded)
    // markup matches on hydration, then syncs the real preference in —
    // unavoidable for an effect that reads an external-to-React source.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Private-browsing / storage-blocked contexts — default (expanded) is fine.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Ignore — the toggle still works for this page load.
      }
      return next;
    });
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <ChatSidebar open={open} onClose={() => setOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở lịch sử trò chuyện"
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border md:hidden"
      >
        <Menu size={18} />
      </button>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
