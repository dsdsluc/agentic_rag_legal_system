"use client";

import { FormEvent, useState } from "react";
import { DomainSelection } from "@/lib/types";
import { DomainBubble } from "./DomainBubble";

export function ChatInput({
  onSend,
  disabled,
  domain,
  onDomainChange,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  // Bundled into the input pill itself (not a separate header control) so
  // picking a domain reads as part of asking the question, not a distant
  // settings toggle — same interaction, one unit.
  domain: DomainSelection;
  onDomainChange: (domain: DomainSelection) => void;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-full bg-card py-1.5 pr-1.5 pl-4 shadow-sm ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-primary">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nhập câu hỏi pháp luật của bạn..."
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <DomainBubble domain={domain} onChange={onDomainChange} compact />
      </div>
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Gửi câu hỏi"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </button>
    </form>
  );
}
