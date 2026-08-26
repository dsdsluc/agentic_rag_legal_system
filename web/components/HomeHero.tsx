"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { AnswerMode, DomainSelection } from "@/lib/types";
import { useChatStore } from "@/lib/chat-store";
import { ModeBubble } from "./ModeBubble";
import { LegalWorkspaceLink } from "./LegalWorkspaceLink";
import { ChatInput } from "./ChatInput";

// Rotates with the domain selector so picking a workspace immediately shows
// something concrete to ask it, instead of the chips staying frozen on
// traffic-only examples now that dân sự/hình sự exist too.
const SUGGESTIONS: Record<DomainSelection, string[]> = {
  auto: [
    "Mức phạt vượt đèn đỏ xe máy",
    "Hợp đồng vay tiền không giấy tờ có đòi được không?",
    "Tội trộm cắp tài sản bị phạt bao nhiêu năm tù?",
    "Thủ tục cấp lại GPLX bị mất",
  ],
  giao_thong: [
    "Mức phạt vượt đèn đỏ xe máy",
    "Nồng độ cồn khi lái ô tô bị phạt thế nào?",
    "Thủ tục cấp lại GPLX bị mất",
    "Tốc độ tối đa trong khu dân cư",
  ],
  dan_su: [
    "Hợp đồng vay tiền không giấy tờ có đòi được không?",
    "Di chúc miệng có hợp pháp không?",
    "Bồi thường thiệt hại ngoài hợp đồng là gì?",
    "Thời hiệu khởi kiện tranh chấp dân sự",
  ],
  hinh_su: [
    "Tội trộm cắp tài sản bị phạt bao nhiêu năm tù?",
    "Gây tai nạn giao thông chết người xử lý thế nào?",
    "Độ tuổi chịu trách nhiệm hình sự",
    "Tội cố ý gây thương tích bị xử lý ra sao?",
  ],
};

const GREETING: Record<AnswerMode, string> = {
  citizen: "Hỏi tôi về mức phạt, thủ tục, hay quyền lợi của bạn — trả lời dễ hiểu, không thuật ngữ.",
  professional: "Câu trả lời sẽ kèm trích dẫn đầy đủ Luật, Nghị định, Thông tư, Điều, Khoản, Điểm.",
};

export function HomeHero() {
  const router = useRouter();
  const { startConversation } = useChatStore();
  const [mode, setMode] = useState<AnswerMode>("citizen");
  const [domain, setDomain] = useState<DomainSelection>("auto");
  const [pending, setPending] = useState(false);

  function handleSend(text: string) {
    setPending(true);
    const id = startConversation(mode, domain, text);
    router.push(`/c/${id}`);
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex justify-end gap-2 px-4 pt-4 md:px-6">
        <LegalWorkspaceLink />
        <ModeBubble mode={mode} onChange={setMode} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Scale size={22} />
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          Bạn cần hỗ trợ gì về pháp luật?
        </h1>
        <p
          key={mode}
          className="mt-2 max-w-md animate-in fade-in text-center text-sm text-muted-foreground duration-300"
        >
          {GREETING[mode]}
        </p>

        <div className="mt-8 w-full max-w-2xl xl:max-w-3xl">
          <ChatInput onSend={handleSend} disabled={pending} domain={domain} onDomainChange={setDomain} />
        </div>

        <div key={domain} className="mt-4 flex w-full max-w-2xl xl:max-w-3xl flex-wrap justify-center gap-2 animate-in fade-in duration-300">
          {SUGGESTIONS[domain].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSend(s)}
              disabled={pending}
              className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
