import { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DOMAIN_ORDER, domainMeta } from "@/lib/domain";
import { AnswerText } from "./AnswerText";

// The "verification" step the domain selector promises made visible: shows
// what the backend actually understood the question to be about (manual
// pick or classify_domains()'s auto-detected list), not just a silent
// filter. All 3 domains present means nothing was actually narrowed, so
// there's nothing informative to show.
function DomainTags({ domains }: { domains: string[] }) {
  if (domains.length === 0 || domains.length >= DOMAIN_ORDER.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Lĩnh vực:</span>
      {domains.map((d) => {
        const meta = domainMeta(d);
        return (
          <span
            key={d}
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", meta.soft)}
          >
            <meta.icon size={10} />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  // Soft tint + colored ink, matching how badges/chips read everywhere
  // else in the app — a solid saturated fill was the one place still
  // carrying the old cool-toned identity.
  const userBubbleClass =
    message.mode === "citizen"
      ? "bg-citizen-soft text-citizen-foreground border-citizen/20"
      : "bg-professional-soft text-professional-foreground border-professional/20";

  if (isUser) {
    return (
      <div className="flex animate-in fade-in slide-in-from-bottom-1 justify-end duration-200">
        <div
          className={cn(
            "max-w-[75%] rounded-3xl border px-4 py-2.5 text-[15px] leading-relaxed shadow-sm",
            userBubbleClass
          )}
        >
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex animate-in fade-in slide-in-from-bottom-1 justify-start duration-200">
      <div className="max-w-[85%]">
        <div
          className={cn(
            "rounded-3xl border border-border/70 bg-bubble-assistant px-4 py-5 text-[15px] text-bubble-assistant-foreground shadow-sm",
            message.error && "border-destructive/20 bg-destructive/10 text-destructive"
          )}
        >
          {message.pending ? (
            <TypingDots />
          ) : message.error ? (
            <p>{message.error}</p>
          ) : (
            <>
              {message.domains && <DomainTags domains={message.domains} />}
              <AnswerText text={message.text} mode={message.mode} sources={message.sources} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-current opacity-40"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
