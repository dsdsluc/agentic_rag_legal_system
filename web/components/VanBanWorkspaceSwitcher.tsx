"use client";

import { useState } from "react";
import { domainMeta } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { IndexDocItem, VanBanIndexGrid } from "@/components/VanBanIndexGrid";

export interface Workspace {
  domain: string;
  docCount: number;
  articleCount: number;
  columns: { type: string; docs: IndexDocItem[] }[];
}

function WorkspaceTab({ workspace, active, onClick }: { workspace: Workspace; active: boolean; onClick: () => void }) {
  const meta = domainMeta(workspace.domain);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex flex-1 items-center gap-3.5 overflow-hidden rounded-xl border p-4 text-left transition-all duration-200",
        active
          ? cn("border-transparent bg-card shadow-[0_8px_20px_-10px_rgba(0,0,0,0.25)]", meta.border)
          : "border-border bg-card/60 hover:bg-card"
      )}
    >
      {active && (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 bg-linear-to-br opacity-[0.08]", meta.gradientFrom, "to-transparent")}
        />
      )}
      <span
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
          active ? meta.chip : "bg-muted text-muted-foreground"
        )}
      >
        <meta.icon size={18} />
      </span>
      <span className="relative min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="font-serif text-[15px] font-semibold">{meta.label}</span>
          <span className="text-[11px] text-muted-foreground">{workspace.docCount} văn bản</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta.tagline}</span>
      </span>
    </button>
  );
}

export function VanBanWorkspaceSwitcher({ workspaces }: { workspaces: Workspace[] }) {
  const [active, setActive] = useState(0);
  if (workspaces.length === 0) return null;
  const safeActive = Math.min(active, workspaces.length - 1);
  const current = workspaces[safeActive];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row">
        {workspaces.map((w, i) => (
          <WorkspaceTab key={w.domain} workspace={w} active={i === safeActive} onClick={() => setActive(i)} />
        ))}
      </div>

      <div key={current.domain} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
        <VanBanIndexGrid columns={current.columns} />
      </div>
    </div>
  );
}
