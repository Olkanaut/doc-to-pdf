import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Shared logo/font assets, reusable by templates compiled locally. */
export const TEMPLATES_ASSETS_DIR = path.resolve(
  __dirname,
  "../../templates/assets",
);
