"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { StructuredArticleText } from "@/components/StructuredArticleText";
import { useCanEditLegalContent } from "./useCanEditLegalContent";
import { EditActions } from "./EditActions";

// Điều with no Khoản rows (see StructuredArticleText) — the whole body is
// one text blob, so editing it means editing article.text directly rather
// than any one Khoản.
export function EditableArticleBody({
  articleId,
  text,
  needsReview,
}: {
  articleId: string;
  text: string;
  needsReview: boolean;
}) {
  const canEdit = useCanEditLegalContent();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [textValue, setTextValue] = useState(text);
  const [reviewValue, setReviewValue] = useState(needsReview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="group/body relative">
        <StructuredArticleText text={text} />
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setTextValue(text);
              setReviewValue(needsReview);
              setError(null);
              setEditing(true);
            }}
            aria-label="Sửa nội dung Điều"
            title="Sửa nội dung Điều"
            className="absolute top-0 right-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/body:opacity-100"
          >
            <Pencil size={14} />
          </button>
        )}
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
        body: JSON.stringify({ text: textValue, needsReview: reviewValue }),
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
    <div className="flex max-w-3xl flex-col gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <textarea
        value={textValue}
        onChange={(e) => setTextValue(e.target.value)}
        rows={Math.min(30, Math.max(6, Math.ceil(textValue.length / 70)))}
        autoFocus
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap outline-none focus:ring-2 focus:ring-primary"
      />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={reviewValue} onChange={(e) => setReviewValue(e.target.checked)} />
        Cần rà soát thêm (OCR chưa xác minh)
      </label>
      <EditActions saving={saving} error={error} onSave={handleSave} onCancel={() => setEditing(false)} />
    </div>
  );
}
