/**
 * Origine de l'instance Docs à laquelle cette app est rattachée : gaufre, lien
 * « voir dans Docs », exemple du champ de recherche. Réglable par VITE_DOCS_URL,
 * parce que Docs et dots ne seront pas sur le même hôte en production.
 */
const raw = import.meta.env.VITE_DOCS_URL as string | undefined;

export const DOCS_ORIGIN = (raw?.trim() || "http://localhost:3011").replace(/\/+$/, "");

/** Adresse d'un document dans Docs, pour y renvoyer depuis le rendu. */
export function docsUrl(id: string): string {
  return `${DOCS_ORIGIN}/docs/${encodeURIComponent(id)}/`;
}
