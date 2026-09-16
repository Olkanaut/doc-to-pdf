import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.resolve(__dirname, "../../data/template-defaults");

function userFile(userId: string): string {
  const key = createHash("sha256").update(userId).digest("hex");
  return path.join(DEFAULTS_DIR, `${key}.json`);
}

export async function readDefaultTemplateId(userId: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(userFile(userId), "utf8"));
    return typeof raw?.templateId === "string" ? raw.templateId : null;
  } catch {
    return null;
  }
}

export async function writeDefaultTemplateId(
  userId: string,
  templateId: string,
): Promise<void> {
  await mkdir(DEFAULTS_DIR, { recursive: true });
  await writeFile(
    userFile(userId),
    JSON.stringify({ templateId }, null, 2),
    "utf8",
  );
}

export async function clearDefaultTemplateId(userId: string): Promise<void> {
  await rm(userFile(userId), { force: true });
}
