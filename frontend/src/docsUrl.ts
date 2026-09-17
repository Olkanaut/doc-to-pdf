/** Identifiant Docs : UUID brut, `/docs/<uuid>` ou `/d/<uuid>`, URL complète tolérée. */
export function docIdFromUrl(url: string): string | null {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const trimmed = url.trim();
  const match = new RegExp(`(?:^|/)(?:d|docs)/(${uuid})(?:[/?#]|$)`, "i").exec(trimmed);
  if (!match) {
    const bare = new RegExp(`^${uuid}$`, "i").exec(trimmed);
    return bare ? bare[0].toLowerCase() : null;
  }
  return match ? match[1].toLowerCase() : null;
}
