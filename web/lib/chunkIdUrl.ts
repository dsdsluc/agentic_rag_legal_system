// Article/Khoan ids are chunk_ids like "ND_165_2024::dieu_16" — the "::"
// triggers a genuinely flaky Next.js 16.3.2 + Turbopack dev-server bug: the
// exact same request (even percent-encoded, "%3A%3A") intermittently 404s
// and intermittently 200s with no code change between requests (confirmed
// via the dev server's own request log, alternating on identical URLs).
// Base64url has no ":" — or any character needing percent-encoding at all
// — in its alphabet, so encoding the id this way for the URL sidesteps
// whatever specifically about ":" the router mishandles, rather than
// hoping percent-encoding is enough (it observably wasn't).
export function encodeChunkIdForUrl(id: string): string {
  return Buffer.from(id, "utf-8").toString("base64url");
}

export function decodeChunkIdFromUrl(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf-8");
}
