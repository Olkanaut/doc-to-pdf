import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Fixture } from "../types/blocks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures");

export async function listFixtures(): Promise<{ id: string; name: string }[]> {
  const files = await readdir(FIXTURES_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const fixtures = await Promise.all(
    jsonFiles.map(async (file) => {
      const fixture = await loadFixtureFile(file);
      return { id: fixture.id, name: fixture.name };
    }),
  );
  return fixtures;
}

export async function getFixture(id: string): Promise<Fixture | undefined> {
  const files = await readdir(FIXTURES_DIR);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fixture = await loadFixtureFile(file);
    if (fixture.id === id) return fixture;
  }
  return undefined;
}

async function loadFixtureFile(file: string): Promise<Fixture> {
  const raw = await readFile(path.join(FIXTURES_DIR, file), "utf8");
  return JSON.parse(raw) as Fixture;
}
