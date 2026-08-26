"use client";

import Link from "next/link";
import { ArrowUpRight, Link2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface RelatedDocEntry {
  id: string;
  relationType: string;
  href: string | null;
  label: string;
  /** "văn bản này" suffix vs. plain relationType prefix — mirrors the two
   * original phrasings ("X: [doc]" vs "[doc] X văn bản này"). */
  suffix?: boolean;
}

export function RelatedDocumentsPanel({ entries }: { entries: RelatedDocEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted">
        <Link2 size={13} />
        Văn bản liên quan
        <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">{entries.length}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[70vh] overflow-y-auto">
        <p className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Văn bản liên quan
        </p>
        <div className="flex flex-col gap-2">
          {entries.map((rel) => (
            <div key={rel.id} className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
              {rel.suffix ? (
                <>
                  {rel.href ? (
                    <Link href={rel.href} className="flex items-center gap-1 font-medium text-primary hover:underline">
                      {rel.label}
                      <ArrowUpRight size={13} className="shrink-0" />
                    </Link>
                  ) : (
                    <p className="font-medium">{rel.label}</p>
                  )}
                  <span className="mt-0.5 block text-xs text-muted-foreground">{rel.relationType} văn bản này</span>
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-muted-foreground">{rel.relationType}</span>
                  {rel.href ? (
                    <Link
                      href={rel.href}
                      className="mt-0.5 flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {rel.label}
                      <ArrowUpRight size={13} className="shrink-0" />
                    </Link>
                  ) : (
                    <p className="mt-0.5">{rel.label}</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
