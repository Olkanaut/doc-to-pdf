export type SuiteAppLink = {
  id: string;
  label: string;
  description: string;
  href: string;
  external?: boolean;
};

const envUrl = (key: string, fallback?: string) => {
  const value = import.meta.env[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
};

const docsUrl = envUrl("VITE_DOCS_URL") ?? "http://localhost:3000";
const driveUrl = envUrl("VITE_DRIVE_URL");

export const suiteApps: SuiteAppLink[] = [
  {
    id: "dots",
    label: "Dots",
    description: "PDF propres depuis Docs",
    href: "/",
  },
  {
    id: "docs",
    label: "Docs",
    description: "Rédiger et partager",
    href: docsUrl,
    external: true,
  },
  ...(driveUrl
    ? [
        {
          id: "drive",
          label: "Drive",
          description: "Fichiers et espaces",
          href: driveUrl,
          external: true,
        },
      ]
    : []),
];
