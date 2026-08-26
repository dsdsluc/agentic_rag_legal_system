"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { ReviewGroup, type ReviewItem } from "./ReviewGroup";
import { DOC_TYPE_ORDER, docTypeMeta } from "@/lib/docType";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ReviewDocGroup {
  docId: string;
  docTitle: string;
  docType: string;
  items: ReviewItem[];
}

export function ContentReviewPageClient({ groups, total }: { groups: ReviewDocGroup[]; total: number }) {
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [docFilter, setDocFilter] = useState<string>("all");

  // Only offer types/documents that actually have something to review right
  // now — an empty filter option would just be a dead end.
  const availableTypes = useMemo(
    () => DOC_TYPE_ORDER.filter((t) => groups.some((g) => g.docType === t)),
    [groups]
  );
  const availableDocs = useMemo(
    () => groups.filter((g) => docTypeFilter === "all" || g.docType === docTypeFilter),
    [groups, docTypeFilter]
  );

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (docTypeFilter !== "all" && g.docType !== docTypeFilter) return false;
      if (docFilter !== "all" && g.docId !== docFilter) return false;
      return true;
    });
  }, [groups, docTypeFilter, docFilter]);

  const filteredTotal = filteredGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="w-full px-6 py-6 lg:px-8">
      <AdminPageHeader
        title="Rà soát OCR"
        subtitle={`${filteredTotal} / ${total} đoạn cần rà soát`}
        action={
          <div className="flex items-center gap-2">
            <Select
              value={docTypeFilter}
              onValueChange={(v) => {
                setDocTypeFilter(v ?? "all");
                // A document from a different type would no longer make
                // sense once the type filter narrows — reset it rather
                // than leave a stale, now-invisible selection in place.
                setDocFilter("all");
              }}
            >
              <SelectTrigger size="sm" className="bg-card">
                <SelectValue>{(v: string) => (v === "all" ? "Tất cả loại văn bản" : docTypeMeta(v).label)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại văn bản</SelectItem>
                {availableTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {docTypeMeta(t).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={docFilter} onValueChange={(v) => setDocFilter(v ?? "all")}>
              <SelectTrigger size="sm" className="max-w-64 bg-card">
                <SelectValue>
                  {(v: string) => (v === "all" ? "Tất cả văn bản" : (groups.find((g) => g.docId === v)?.docTitle ?? "Tất cả văn bản"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả văn bản</SelectItem>
                {availableDocs.map((g) => (
                  <SelectItem key={g.docId} value={g.docId}>
                    {g.docTitle} ({g.items.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="mt-5">
        {groups.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Không còn đoạn nào cần rà soát — mọi nội dung OCR đã được xác nhận.
          </p>
        ) : filteredGroups.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Không có đoạn nào phù hợp với bộ lọc hiện tại.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {filteredGroups.map((g) => (
              <ReviewGroup key={g.docId} docTitle={g.docTitle} items={g.items} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
