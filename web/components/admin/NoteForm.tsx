"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecruiterNote } from "@/lib/types";

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full border transition-colors",
        checked ? "border-primary bg-primary" : "border-border bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}

export function NoteForm({ initial }: { initial: RecruiterNote }) {
  const [message, setMessage] = useState(initial.message);
  const [active, setActive] = useState(initial.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RecruiterNote>(initial);

  const dirty = message !== saved.message || active !== saved.active;
  const invalid = active && !message.trim();

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/note", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, active }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Lưu thất bại.");
        return;
      }
      setSaved(body.note);
    } catch {
      setError("Không thể kết nối tới máy chủ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <label htmlFor="note-message" className="text-sm font-medium">
          Nội dung ghi chú
        </label>
        <textarea
          id="note-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          maxLength={2000}
          placeholder={
            "VD:\nTài khoản test: reviewer@demo.local / mật khẩu: ...\n\nLưu ý: bản deploy trên Vercel chỉ chứa phần web (Next.js)." +
            " Backend FastAPI (RAG) không chạy được trên Vercel nên chat có thể không trả lời được — xin thông cảm."
          }
          className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/2000</p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-sm font-medium">Hiển thị ghi chú</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bật để hiện nút ghi chú (icon note) ở khu vực thông báo góc chat — xếp ngay trên chuông thông báo, hiển
            thị công khai, không cần đăng nhập để xem. Tắt thì nút này biến mất hoàn toàn.
          </p>
        </div>
        <Switch checked={active} onChange={setActive} label="Hiển thị ghi chú" />
      </div>

      {invalid && <p className="text-sm text-destructive">Cần nhập nội dung ghi chú trước khi lưu.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !dirty || invalid}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          Lưu thay đổi
        </Button>
        {!dirty && !saving && (
          <span className="text-xs text-muted-foreground">
            Đã lưu lúc {new Date(saved.updatedAt).toLocaleString("vi-VN")}
          </span>
        )}
      </div>
    </div>
  );
}
