import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");

export interface TemplateDescriptor {
  id: string;
  name: string;
  description: string;
  file: string;
}

export const TEMPLATES: TemplateDescriptor[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Marges classiques, pagination centrée, sans en-tête.",
    file: "minimal.typ",
  },
  {
    id: "ministere",
    name: "Ministère",
    description: "En-tête avec logo et bandeau bleu, pagination en pied de page.",
    file: "ministere.typ",
  },
  {
    id: "collectivite",
    name: "Collectivité",
    description: "En-tête avec logo et bandeau vert.",
    file: "collectivite.typ",
  },
];

export function getTemplate(id: string): TemplateDescriptor | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function templatePath(descriptor: TemplateDescriptor): string {
  return path.join(TEMPLATES_DIR, descriptor.file);
}

export const TEMPLATES_ASSETS_DIR = path.join(TEMPLATES_DIR, "assets");
