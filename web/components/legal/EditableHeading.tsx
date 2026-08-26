"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useCanEditLegalContent } from "./useCanEditLegalContent";
import { EditActions } from "./EditActions";

export function EditableHeading({
  articleId,
  articleNumber,
  heading,
  needsReview,
}: {
  articleId: string;
  articleNumber: number | null;
  heading: string | null;
  needsReview: boolean;
}) {
  const canEdit = useCanEditLegalContent();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [headingValue, setHeadingValue] = useState(heading ?? "");
  const [reviewValue, setReviewValue] = useState(needsReview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleNode = (
    <h1 className="font-serif text-2xl font-semibold tracking-tight md:text-[1.75rem]">
      Điều {articleNumber}
      {heading ? `. ${heading}` : ""}
    </h1>
  );

  if (!canEdit) return titleNode;

  if (!editing) {
    return (
      <div className="group/heading flex items-center gap-2">
        {titleNode}
        <button
          type="button"
          onClick={() => {
            setHeadingValue(heading ?? "");
            setReviewValue(needsReview);
            setError(null);
            setEditing(true);
          }}
          aria-label="Sửa tiêu đề Điều"
          title="Sửa tiêu đề Điều"
          className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/heading:opacity-100"
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/van-ban/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heading: headingValue.trim() || null, needsReview: reviewValue }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Không thể lưu.");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-lg font-semibold text-muted-foreground">Điều {articleNumber}.</span>
        <input
          value={headingValue}
          onChange={(e) => setHeadingValue(e.target.value)}
          autoFocus
          placeholder="Tiêu đề Điều"
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 font-serif text-lg font-semibold outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={reviewValue} onChange={(e) => setReviewValue(e.target.checked)} />
        Cần rà soát thêm (OCR chưa xác minh)
      </label>
      <EditActions saving={saving} error={error} onSave={handleSave} onCancel={() => setEditing(false)} />
    </div>
  );
}
