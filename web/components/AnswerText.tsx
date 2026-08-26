import { ReactNode } from "react";
import Link from "next/link";
import { AnswerMode, SourceOut } from "@/lib/types";
import { citationHref } from "@/lib/citationHref";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Matches the exact citation shape the generation prompt is instructed to
// produce (src/rag/generate.py): one or more consecutive "[n]" markers
// (a single fact sometimes draws on more than one source chunk, e.g.
// "[1][2]") immediately followed by the "(Tên văn bản, Điều X...)"
// parenthetical — which itself may list several documents separated by
// ";" when a claim spans more than one văn bản. Captured together so the
// parenthetical text — not just the bracket numbers — can link out to the
// matching Điều(s), same target the old citation chips row used to.
const CITATION_RE = /((?:\[\d+\])+)(?:\s*\(([^)]+)\))?/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;

function SourceLink({ source, children, keyPrefix }: { source: SourceOut; children: ReactNode; keyPrefix: string }) {
  return (
    <Tooltip key={keyPrefix}>
      <TooltipTrigger
        render={<Link href={citationHref(source)} target="_blank" rel="noopener noreferrer" />}
        className="text-professional-foreground underline decoration-professional/50 decoration-dotted underline-offset-2 transition-colors hover:decoration-professional hover:decoration-solid"
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">
        <p className="mb-1 font-semibold">
          {source.doc_title}
          {source.article_number != null ? `, Điều ${source.article_number}` : ""}
        </p>
        {source.article_heading && <p className="opacity-80">{source.article_heading}</p>}
        {(source.is_amendment_context || source.needs_review) && (
          <p className="mt-1 flex gap-1">
            {source.is_amendment_context && (
              <span className="rounded-full bg-professional/20 px-1.5 text-[0.65em]">sửa đổi</span>
            )}
            {source.needs_review && (
              <span className="rounded-full bg-destructive/15 px-1.5 text-[0.65em] text-destructive">OCR</span>
            )}
          </p>
        )}
        <p className="mt-1 text-[0.7em] opacity-60">Bấm để xem toàn văn ↗</p>
      </TooltipContent>
    </Tooltip>
  );
}

// The LLM's own answers routinely use markdown bold ("**Đối với ô tô**")
// even though nothing asked it to — this renderer is a deliberately
// lightweight custom formatter (not a markdown library), so without this
// the asterisks were showing up literally in the chat bubble instead of
// being rendered as bold.
function renderCitations(text: string, mode: AnswerMode, keyPrefix: string, sources?: SourceOut[]): ReactNode {
  if (mode !== "professional") {
    return text.replace(CITATION_RE, "");
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let citationIndex = 0;
  const re = new RegExp(CITATION_RE);

  while ((match = re.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    const refs = [...match[1].matchAll(/\d+/g)].map((m) => Number(m[0]));
    refs.forEach((n, i) => {
      parts.push(
        <sup
          key={`${keyPrefix}-c${citationIndex}-n${i}`}
          className="ml-0.5 rounded-full bg-professional/15 px-1.5 py-0.5 text-[0.65em] font-semibold text-professional-foreground"
        >
          {n}
        </sup>
      );
    });

    const parenInner = match[2];
    if (parenInner) {
      // "n" documents in the citation and "n" ";"-separated segments in the
      // parenthetical: pair them up so each segment links to its own
      // source. Any mismatch (LLM phrasing didn't split cleanly) falls back
      // to one link over the whole parenthetical, pointed at the first
      // source — degrades gracefully instead of losing the link entirely.
      const segments = parenInner.split(";").map((s) => s.trim()).filter(Boolean);
      parts.push("(");
      if (segments.length === refs.length && refs.length > 0) {
        segments.forEach((seg, i) => {
          if (i > 0) parts.push("; ");
          const source = sources?.[refs[i] - 1];
          parts.push(
            source ? (
              <SourceLink key={`${keyPrefix}-c${citationIndex}-s${i}`} source={source} keyPrefix={`${keyPrefix}-c${citationIndex}-s${i}`}>
                {seg}
              </SourceLink>
            ) : (
              <span key={`${keyPrefix}-c${citationIndex}-s${i}`}>{seg}</span>
            )
          );
        });
      } else {
        const source = sources?.[refs[0] - 1];
        parts.push(
          source ? (
            <SourceLink key={`${keyPrefix}-c${citationIndex}-whole`} source={source} keyPrefix={`${keyPrefix}-c${citationIndex}-whole`}>
              {parenInner}
            </SourceLink>
          ) : (
            <span key={`${keyPrefix}-c${citationIndex}-whole`}>{parenInner}</span>
          )
        );
      }
      parts.push(")");
    }

    citationIndex++;
    lastIndex = match.index + match[0].length;
  }
  parts.push(text.slice(lastIndex));
  return parts;
}

function renderInline(text: string, mode: AnswerMode, keyPrefix: string, sources?: SourceOut[]): ReactNode {
  const normalized = text.replace(/\s{2,}/g, " ");
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let boldIndex = 0;
  const re = new RegExp(BOLD_RE);

  while ((match = re.exec(normalized))) {
    if (match.index > lastIndex) {
      parts.push(renderCitations(normalized.slice(lastIndex, match.index), mode, `${keyPrefix}-t${boldIndex}`, sources));
    }
    parts.push(
      <strong key={`${keyPrefix}-b-${boldIndex}`}>
        {renderCitations(match[1], mode, `${keyPrefix}-bt${boldIndex}`, sources)}
      </strong>
    );
    boldIndex++;
    lastIndex = match.index + match[0].length;
  }
  parts.push(renderCitations(normalized.slice(lastIndex), mode, `${keyPrefix}-tail`, sources));
  return parts;
}

export function AnswerText({ text, mode, sources }: { text: string; mode: AnswerMode; sources?: SourceOut[] }) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        const isBullet = /^[-•]\s+/.test(trimmed);
        const content = isBullet ? trimmed.replace(/^[-•]\s+/, "") : trimmed;

        if (isBullet) {
          return (
            <div key={idx} className="flex gap-2 pl-1">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
              <p className="leading-relaxed">{renderInline(content, mode, `l${idx}`, sources)}</p>
            </div>
          );
        }
        return (
          <p key={idx} className="leading-relaxed">
            {renderInline(content, mode, `l${idx}`, sources)}
          </p>
        );
      })}
    </div>
  );
}
