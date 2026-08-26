"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ReviewItem {
  kind: "article" | "khoan";
  id: string;
  label: string;
  snippet: string;
  href: string;
}

export function ReviewGroup({ docTitle, items }: { docTitle: string; items: ReviewItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<ReviewItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      const url = pending.kind === "article" ? `/api/van-ban/articles/${pending.id}` : `/api/van-ban/khoans/${pending.id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsReview: false }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Không thể lưu.");
      setPending(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đã xảy ra lỗi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="font-serif text-sm font-semibold">{docTitle}</h2>
        <span className="text-xs text-muted-foreground">{items.length} đoạn</span>
      </div>
      <ul className="flex flex-col divide-y divide-border/70">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
              >
                {item.label}
                <ExternalLink size={11} className="text-muted-foreground" />
              </Link>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.snippet}</p>
            </div>
            <button
              type="button"
              onClick={() => setPending(item)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CheckCircle2 size={12} />
              Đã rà soát
            </button>
          </li>
        ))}
      </ul>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPending(null);
              setError(null);
            }
          }}
          title="Đánh dấu đã rà soát?"
          description={`Xác nhận nội dung "${pending.label}" đã đúng và không cần sửa chữ nào. Cờ "cần rà soát OCR" sẽ được tắt.`}
          confirmLabel="Đánh dấu đã rà soát"
          loading={saving}
          error={error}
          onConfirm={handleConfirm}
        />
      )}
    </section>
  );
}
