import { SourceOut } from "./types";

// Điều-level detail page when we have one to point at; falls back to the
// document overview for chunks with no article_number (preamble/annex),
// which have no dedicated detail route of their own.
export function citationHref(source: SourceOut): string {
  return source.article_number != null
    ? `/van-ban/${source.doc_id}/dieu/${source.article_number}`
    : `/van-ban/${source.doc_id}`;
}
