import { Car, Gavel, Handshake, type LucideIcon } from "lucide-react";

// Subject-matter workspaces on /van-ban — orthogonal to DocType's legal-rank
// taxonomy (lib/docType.ts): each workspace here still spans Luật/Nghị
// định/Thông tư internally. Mirrors the Prisma `Domain` enum and
// documents.json's `domain` field (src/ingestion/models.py).
export interface DomainMeta {
  label: string;
  tagline: string;
  icon: LucideIcon;
  chip: string;
  soft: string;
  text: string;
  border: string;
  gradientFrom: string;
  /** Translucent trigger-button treatment — same recipe as ModeBubble's
   * citizen/professional bubbles (soft/60 bg, /25 border, solid text). */
  bubble: string;
}

export const DOMAIN_META: Record<string, DomainMeta> = {
  giao_thong: {
    label: "Giao thông",
    tagline: "Luật Trật tự ATGT, xử phạt vi phạm, đăng kiểm, giấy phép lái xe",
    icon: Car,
    chip: "bg-giaothong text-white",
    soft: "bg-giaothong-soft text-giaothong-foreground",
    text: "text-giaothong-foreground",
    border: "border-giaothong/40",
    gradientFrom: "from-giaothong",
    bubble: "border-giaothong/25 bg-giaothong-soft/60 text-giaothong-foreground hover:bg-giaothong-soft/80",
  },
  dan_su: {
    label: "Dân sự",
    tagline: "Bộ luật Dân sự, tố tụng dân sự — hợp đồng, tài sản, thừa kế",
    icon: Handshake,
    chip: "bg-dansu text-white",
    soft: "bg-dansu-soft text-dansu-foreground",
    text: "text-dansu-foreground",
    border: "border-dansu/40",
    gradientFrom: "from-dansu",
    bubble: "border-dansu/25 bg-dansu-soft/60 text-dansu-foreground hover:bg-dansu-soft/80",
  },
  hinh_su: {
    label: "Hình sự",
    tagline: "Bộ luật Hình sự, tố tụng hình sự — tội danh, khung hình phạt",
    icon: Gavel,
    chip: "bg-hinhsu text-white",
    soft: "bg-hinhsu-soft text-hinhsu-foreground",
    text: "text-hinhsu-foreground",
    border: "border-hinhsu/40",
    gradientFrom: "from-hinhsu",
    bubble: "border-hinhsu/25 bg-hinhsu-soft/60 text-hinhsu-foreground hover:bg-hinhsu-soft/80",
  },
};

export const DOMAIN_ORDER = ["giao_thong", "dan_su", "hinh_su"];

const FALLBACK: DomainMeta = {
  label: "Khác",
  tagline: "",
  icon: Gavel,
  chip: "bg-muted text-foreground",
  soft: "bg-muted text-muted-foreground",
  text: "text-foreground",
  border: "border-border",
  gradientFrom: "from-muted-foreground",
  bubble: "border-border bg-card/70 text-muted-foreground hover:bg-card",
};

export function domainMeta(domain: string): DomainMeta {
  return DOMAIN_META[domain] ?? FALLBACK;
}

// One domain to represent a whole conversation (e.g. the sidebar's per-item
// icon) from a QueryResponse.domains-style list. Empty/missing defaults to
// "giao_thong" rather than "unknown" — every conversation created before
// this multi-domain feature existed only ever could have been about traffic
// law (it was the only domain in the corpus), so an old, un-tagged message
// is confidently giao_thong, not ambiguous. A list with 2-3 entries means
// classify_domains() genuinely couldn't narrow it down (or deliberately
// didn't filter) — those render with no specific icon rather than guessing.
export function representativeDomain(domains: string[] | null | undefined): string | null {
  if (!domains || domains.length === 0) return "giao_thong";
  if (domains.length === 1) return domains[0];
  return null;
}
