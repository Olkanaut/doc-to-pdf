/**
 * Origine de l'instance Docs à laquelle cette app est rattachée : gaufre, lien
 * « voir dans Docs », exemple du champ de recherche. Réglable par VITE_DOCS_URL,
 * parce que Docs et dots ne seront pas sur le même hôte en production.
 */
function cleanOrigin(value: string | undefined, fallback?: string): string {
  return (value?.trim() || fallback || "").replace(/\/+$/, "");
}

const rawDocsUrl = import.meta.env.VITE_DOCS_URL as string | undefined;
const rawDotsUrl = import.meta.env.VITE_DOTS_URL as string | undefined;
const rawLasuiteServicesApiUrl = import.meta.env.VITE_LASUITE_SERVICES_API_URL as
  | string
  | undefined;

const browserOrigin = typeof window === "undefined" ? "http://localhost:3002" : window.location.origin;

export const DOCS_ORIGIN = cleanOrigin(rawDocsUrl, "http://localhost:3000");
export const DOTS_ORIGIN = cleanOrigin(rawDotsUrl, browserOrigin);
export const LASUITE_SERVICES_API_URL = cleanOrigin(
  rawLasuiteServicesApiUrl,
  "https://integration.lasuite.numerique.gouv.fr/api/v1/services.json",
);

/** Adresse d'un document dans Docs, pour y renvoyer depuis le rendu. */
export function docsUrl(id: string): string {
  return `${DOCS_ORIGIN}/docs/${encodeURIComponent(id)}/`;
}
