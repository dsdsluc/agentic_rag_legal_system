import { BookText, Landmark, Scale, ScrollText, type LucideIcon } from "lucide-react";

export interface DocTypeMeta {
  label: string;
  icon: LucideIcon;
  /** Small solid icon chip. */
  chip: string;
  /** Soft badge background + text pairing. */
  soft: string;
  text: string;
  hoverBorder: string;
  /** Tailwind `from-*` stop for a top accent gradient bar. */
  gradientFrom: string;
  /** Book-spine left border, ~4px, on cards and the document hero. */
  spine: string;
}

// Luật reuses the app's existing "professional" blue — viewing raw văn bản
// is inherently the Chuyên gia register. Nghị định/Thông tư get two new
// tokens (globals.css) that continue the same HIG-system-color approach,
// so accent color tracks legal rank: Luật > Nghị định > Thông tư.
export const DOC_TYPE_META: Record<string, DocTypeMeta> = {
  luat: {
    label: "Luật",
    icon: Scale,
    chip: "bg-professional text-white",
    soft: "bg-professional-soft text-professional-foreground",
    text: "text-professional-foreground",
    hoverBorder: "hover:border-professional/40",
    gradientFrom: "from-professional",
    spine: "border-l-professional",
  },
  // Same Quốc hội-level authority as luật above (a bộ luật IS a luật — just
  // the appellation Quốc hội uses for a large codification, e.g. Bộ luật
  // Dân sự/Hình sự) — so it reuses the professional accent, distinguished
  // only by label + icon, not by rank color.
  bo_luat: {
    label: "Bộ luật",
    icon: BookText,
    chip: "bg-professional text-white",
    soft: "bg-professional-soft text-professional-foreground",
    text: "text-professional-foreground",
    hoverBorder: "hover:border-professional/40",
    gradientFrom: "from-professional",
    spine: "border-l-professional",
  },
  nghi_dinh: {
    label: "Nghị định",
    icon: Landmark,
    chip: "bg-nghidinh text-white",
    soft: "bg-nghidinh-soft text-nghidinh-foreground",
    text: "text-nghidinh-foreground",
    hoverBorder: "hover:border-nghidinh/40",
    gradientFrom: "from-nghidinh",
    spine: "border-l-nghidinh",
  },
  thong_tu: {
    label: "Thông tư",
    icon: ScrollText,
    chip: "bg-thongtu text-white",
    soft: "bg-thongtu-soft text-thongtu-foreground",
    text: "text-thongtu-foreground",
    hoverBorder: "hover:border-thongtu/40",
    gradientFrom: "from-thongtu",
    spine: "border-l-thongtu",
  },
};

export const DOC_TYPE_ORDER = ["luat", "bo_luat", "nghi_dinh", "thong_tu"];

const FALLBACK: DocTypeMeta = {
  label: "Văn bản",
  icon: Scale,
  chip: "bg-muted text-foreground",
  soft: "bg-muted text-muted-foreground",
  text: "text-foreground",
  hoverBorder: "hover:border-border",
  gradientFrom: "from-muted-foreground",
  spine: "border-l-border",
};

export function docTypeMeta(docType: string): DocTypeMeta {
  return DOC_TYPE_META[docType] ?? FALLBACK;
}
