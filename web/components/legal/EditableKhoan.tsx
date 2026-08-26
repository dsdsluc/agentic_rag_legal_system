"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanEditLegalContent } from "./useCanEditLegalContent";
import { EditActions } from "./EditActions";

function formatFine(min: number | null, max: number | null): string | null {
  if (max == null) return null;
  const fmt = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
  return min != null ? `${fmt(min)} – ${fmt(max)}` : `đến ${fmt(max)}`;
}

export function EditableKhoan({
  khoanId,
  khoanNumber,
  text,
  fineMin,
  fineMax,
  needsReview,
  badgeClassName,
}: {
  khoanId: string;
  khoanNumber: string;
  text: string;
  fineMin: number | null;
  fineMax: number | null;
  needsReview: boolean;
  badgeClassName: string;
}) {
  const canEdit = useCanEditLegalContent();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [textValue, setTextValue] = useState(text);
  const [fineMinValue, setFineMinValue] = useState(fineMin != null ? String(fineMin) : "");
  const [fineMaxValue, setFineMaxValue] = useState(fineMax != null ? String(fineMax) : "");
  const [reviewValue, setReviewValue] = useState(needsReview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fine = formatFine(fineMin, fineMax);
  const badge = <span className={cn("rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold", badgeClassName)}>Khoản {khoanNumber}</span>;

  if (!editing) {
    return (
      <div className="group/khoan">
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          {fine && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground/80">{fine}</span>
          )}
          {needsReview && (
            <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">OCR</span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setTextValue(text);
                setFineMinValue(fineMin != null ? String(fineMin) : "");
                setFineMaxValue(fineMax != null ? String(fineMax) : "");
                setReviewValue(needsReview);
                setError(null);
                setEditing(true);
              }}
              aria-label="Sửa khoản này"
              title="Sửa khoản này"
              className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/khoan:opacity-100"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/van-ban/khoans/${khoanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textValue,
          fineMin: fineMinValue.trim() === "" ? null : Number(fineMinValue),
          fineMax: fineMaxValue.trim() === "" ? null : Number(fineMaxValue),
          needsReview: reviewValue,
        }),
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
    <div className="flex flex-col gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        {badge}
        <span className="text-[11px] font-medium text-muted-foreground">Đang chỉnh sửa</span>
      </div>
      <textarea
        value={textValue}
        onChange={(e) => setTextValue(e.target.value)}
        rows={Math.min(20, Math.max(4, Math.ceil(textValue.length / 70)))}
        autoFocus
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed whitespace-pre-wrap outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-1.5">
          Mức phạt từ
          <input
            type="number"
            min={0}
            value={fineMinValue}
            onChange={(e) => setFineMinValue(e.target.value)}
            className="w-28 rounded-md border border-border bg-background px-1.5 py-1 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="flex items-center gap-1.5">
          đến
          <input
            type="number"
            min={0}
            value={fineMaxValue}
            onChange={(e) => setFineMaxValue(e.target.value)}
            className="w-28 rounded-md border border-border bg-background px-1.5 py-1 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={reviewValue} onChange={(e) => setReviewValue(e.target.checked)} />
          Cần rà soát thêm (OCR)
        </label>
      </div>
      <EditActions saving={saving} error={error} onSave={handleSave} onCancel={() => setEditing(false)} />
    </div>
  );
}
