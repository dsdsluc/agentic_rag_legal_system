// Some Điều have no Khoản rows in the database (the ingestion pipeline
// didn't split them out) even though their raw text still contains real
// "1. ... 2. ..." / "a) ... b) ..." structure — rendered as one flat
// paragraph, that structure disappears. This detects those markers in the
// existing text (no data changes) and lays them out like the Khoản/Điểm
// list they actually are.
const KHOAN_MARKER = /^(\d+)\.\s+(.*)$/;
const DIEM_MARKER = /^([a-zđ])\)\s+(.*)$/;

interface Line {
  marker: "khoan" | "diem" | null;
  label: string;
  text: string;
}

function parseLines(raw: string): Line[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((rawLine) => {
      // OCR noise sometimes prepends a stray mark before the real "1."/"a)"
      // list marker (e.g. ". 1. Tín hiệu...") — strip it before matching,
      // without touching the actual wording that follows.
      const line = rawLine.replace(/^[.,;:'"·•]+\s*/, "");
      const khoan = line.match(KHOAN_MARKER);
      if (khoan) return { marker: "khoan" as const, label: khoan[1], text: khoan[2] };
      const diem = line.match(DIEM_MARKER);
      if (diem) return { marker: "diem" as const, label: diem[1], text: diem[2] };
      return { marker: null, label: "", text: line };
    });
}

export function StructuredArticleText({ text }: { text: string }) {
  const lines = parseLines(text);
  const hasStructure = lines.some((l) => l.marker === "khoan");

  if (!hasStructure) {
    return (
      <div className="max-w-3xl space-y-2 text-sm leading-relaxed">
        {lines.map((l, i) => (
          <p key={i}>{l.text}</p>
        ))}
      </div>
    );
  }

  return (
    <ol className="flex max-w-3xl flex-col gap-2.5">
      {lines.map((l, i) => {
        if (l.marker === "khoan") {
          return (
            <li key={i} className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex gap-2 text-sm leading-relaxed">
                <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">{l.label}.</span>
                <span>{l.text}</span>
              </div>
            </li>
          );
        }
        if (l.marker === "diem") {
          return (
            <li key={i} className="ml-6 flex gap-2 text-sm leading-relaxed">
              <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">{l.label})</span>
              <span>{l.text}</span>
            </li>
          );
        }
        return (
          <li key={i} className="text-sm leading-relaxed">
            {l.text}
          </li>
        );
      })}
    </ol>
  );
}
