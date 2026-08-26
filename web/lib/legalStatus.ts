// A document/article only gets a status badge when there's something
// noteworthy to say (amended) — silence means "in force as written," so
// the badge stays a real signal instead of decoration repeated on every
// card. Matches the real ingested relation string ("Được sửa đổi, bổ sung
// bởi") — passive voice, "this document WAS amended BY [target]".
//
// Direction matters: DocumentRelation.fromDocumentId is whichever
// document's own metadata file the line was scraped from, so a document
// checks its own `relationsFrom` for the passive phrasing — the *active*
// phrasing ("Sửa đổi, bổ sung", no "được...bởi") on relationsFrom instead
// means this document amends something else, not the reverse.
function isPassiveAmendedBy(relationType: string): boolean {
  return relationType.startsWith("Được") && (relationType.includes("sửa đổi") || relationType.includes("bổ sung"));
}

export function documentIsAmended(relationsFrom: { relationType: string }[]): boolean {
  return relationsFrom.some((r) => isPassiveAmendedBy(r.relationType));
}
