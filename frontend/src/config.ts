/**
 * Origine de l'instance Docs à laquelle cette app est rattachée : gaufre, lien
 * « voir dans Docs », exemple du champ de recherche. Réglable par VITE_DOCS_URL,
 * parce que Docs et dots ne seront pas sur le même hôte en production.
 * Repli : le port du profil docs-solo (README.md « URLs », demo/ports.docs.env).
 */
const rawDocs = import.meta.env.VITE_DOCS_URL as string | undefined;

export const DOCS_ORIGIN = (rawDocs?.trim() || "http://localhost:3000").replace(/\/+$/, "");

/**
 * Drive n'a pas de repli : il n'est pas lancé par le profil docs-solo. Sans
 * VITE_DRIVE_URL, la gaufre n'affiche que Docs et dots — règle du README.
 */
const rawDrive = import.meta.env.VITE_DRIVE_URL as string | undefined;

export const DRIVE_ORIGIN = rawDrive?.trim() ? rawDrive.trim().replace(/\/+$/, "") : null;

/** Adresse d'un document dans Docs, pour y renvoyer depuis le rendu. */
export function docsUrl(id: string): string {
  return `${DOCS_ORIGIN}/docs/${encodeURIComponent(id)}/`;
}
