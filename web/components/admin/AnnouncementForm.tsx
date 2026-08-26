"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/lib/types";

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

export function AnnouncementForm({ initial }: { initial: Announcement }) {
  const [message, setMessage] = useState(initial.message);
  const [active, setActive] = useState(initial.active);
  const [apiEnabled, setApiEnabled] = useState(initial.apiEnabled);
  const [professionalModeEnabled, setProfessionalModeEnabled] = useState(initial.professionalModeEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Announcement>(initial);

  const dirty =
    message !== saved.message ||
    active !== saved.active ||
    apiEnabled !== saved.apiEnabled ||
    professionalModeEnabled !== saved.professionalModeEnabled;
  // professionalModeEnabled deliberately not in this list — unlike apiEnabled
  // (which breaks ALL of chat), turning off just Chuyên gia leaves Người dân
  // fully usable, and ModeBubble already shows its own explanatory caption
  // wherever the mode picker appears, so a site-wide message isn't required.
  const needsMessage = active || !apiEnabled;
  const invalid = needsMessage && !message.trim();

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, active, apiEnabled, professionalModeEnabled }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Lưu thất bại.");
        return;
      }
      setSaved(body.announcement);
    } catch {
      setError("Không thể kết nối tới máy chủ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <label htmlFor="announcement-message" className="text-sm font-medium">
          Nội dung thông báo
        </label>
        <textarea
          id="announcement-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="VD: Hệ thống sẽ bảo trì từ 22:00 đến 23:00 tối nay."
          className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/2000</p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-sm font-medium">Hiển thị khu vực thông báo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bật để hiện chuông thông báo ở góc chat và Legal Workspace (không hiện với admin). Tắt thì khu vực đó
            biến mất hoàn toàn — không phải chỉ ẩn nội dung.
          </p>
        </div>
        <Switch checked={active} onChange={setActive} label="Hiển thị khu vực thông báo" />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-sm font-medium">Kết nối máy chủ trả lời (FastAPI)</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tắt khi hết token hoặc đang tối ưu backend — người dùng gửi câu hỏi sẽ nhận ngay nội dung thông báo ở
            trên thay vì một câu trả lời lỗi.
          </p>
        </div>
        <Switch checked={apiEnabled} onChange={setApiEnabled} label="Kết nối máy chủ trả lời" />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-sm font-medium">Chế độ Chuyên gia</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tắt để tạm khoá Chế độ Chuyên gia cho mọi người dùng (kiểm soát chi phí — Chuyên gia dùng nhiều token
            hơn Người dân). Người dùng sẽ không chọn được chế độ này, kể cả trong hội thoại đang dở dang; Chế độ
            Người dân không bị ảnh hưởng.
          </p>
        </div>
        <Switch checked={professionalModeEnabled} onChange={setProfessionalModeEnabled} label="Chế độ Chuyên gia" />
      </div>

      {invalid && <p className="text-sm text-destructive">Cần nhập nội dung thông báo trước khi lưu.</p>}
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
