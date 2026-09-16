/** Identifiant d'une URL Docs : `/docs/<uuid>` ou `/d/<uuid>`, URL complète tolérée. */
export function docIdFromUrl(url: string): string | null {
  const match = /(?:^|\/)(?:d|docs)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(
    url.trim(),
  );
  return match ? match[1].toLowerCase() : null;
}
