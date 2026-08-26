"use client";

import { ChevronDown, Wand2 } from "lucide-react";
import { DomainSelection } from "@/lib/types";
import { DOMAIN_ORDER, domainMeta } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";

// Manual override for which legal domain (lib/domain.ts) retrieval is
// scoped to — helps search precision the same way a domain filter helps any
// faceted search, but "Auto" (default) is always available: the backend's
// classify_domains() detects the relevant domain(s) from the question text
// itself when no manual pick is made, so nobody has to know or care which
// bộ luật their question falls under.
const OPTIONS: { domain: DomainSelection; label: string; caption: string }[] = [
  { domain: "auto", label: "Tự động", caption: "Hệ thống tự nhận diện lĩnh vực từ câu hỏi" },
  ...DOMAIN_ORDER.map((d) => ({ domain: d as DomainSelection, label: domainMeta(d).label, caption: domainMeta(d).tagline })),
];

export function DomainBubble({
  domain,
  onChange,
  className,
  compact,
}: {
  domain: DomainSelection;
  onChange: (domain: DomainSelection) => void;
  className?: string;
  /** Tighter padding/text — for embedding inside ChatInput's pill instead
   * of standing alone in a header row. */
  compact?: boolean;
}) {
  const active = OPTIONS.find((o) => o.domain === domain) ?? OPTIONS[0];
  const meta = domain !== "auto" ? domainMeta(domain) : null;
  const Icon = meta?.icon ?? Wand2;
  const bubbleClass = meta ? meta.bubble : "border-border bg-card/70 text-muted-foreground hover:bg-card";

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "group flex shrink-0 items-center rounded-full border font-medium shadow-sm backdrop-blur-md transition-colors",
          compact ? "gap-1 px-2.5 py-1.5 text-[11px]" : "gap-1.5 px-3 py-1.5 text-xs",
          bubbleClass,
          className
        )}
      >
        <Icon size={compact ? 12 : 13} />
        {active.label}
        <ChevronDown
          size={compact ? 11 : 12}
          className="opacity-60 transition-transform group-aria-expanded:rotate-180"
        />
      </MenuTrigger>
      <MenuContent side="top" align="end" className="w-72">
        <MenuRadioGroup value={domain} onValueChange={(value) => onChange(value as DomainSelection)}>
          {OPTIONS.map((option) => {
            const optionMeta = option.domain !== "auto" ? domainMeta(option.domain) : null;
            const OptionIcon = optionMeta?.icon ?? Wand2;
            return (
              <MenuRadioItem key={option.domain} value={option.domain} className="items-start">
                <span className="flex flex-1 flex-col gap-0.5 py-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <OptionIcon size={13} className="shrink-0" />
                    {option.label}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{option.caption}</span>
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
