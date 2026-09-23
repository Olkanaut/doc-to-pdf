import { mkdirSync, writeFileSync } from "node:fs";
import { BASES, CASES, DIR, changedPaths, type Case } from "./cases.js";
import { applyLayout, readLayout } from "../src/layout/layoutTypst.js";
const REPS = Number(process.env.REPS ?? 2);
const OUT = process.env.OUT ?? "runs";
const CONCURRENCY = 4;
const API = process.env.DOTS_BENCH_API ?? "http://localhost:4000/api/ai/template";

// ── Exécution ────────────────────────────────────────────────────────────────

interface Run {
  id: string;
  rep: number;
  base: string;
  instruction: string;
  http: number;
  ok: boolean;
  error?: string;
  summary?: string;
  changes?: string[];
  source?: string;
  check?: { ok: boolean; ms?: number; pages?: number; warnings?: string[]; error?: string; details?: string };
  ms: number;
}

async function runOne(c: Case, rep: number): Promise<Run> {
  const t0 = performance.now();
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: BASES[c.base], instruction: c.instruction }),
    signal: AbortSignal.timeout(300_000),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return {
    id: c.id,
    rep,
    base: c.base,
    instruction: c.instruction,
    http: res.status,
    ok: body.ok === true,
    error: body.error as string | undefined,
    summary: body.summary as string | undefined,
    changes: body.changes as string[] | undefined,
    source: body.source as string | undefined,
    check: body.check as Run["check"],
    ms: Math.round(performance.now() - t0),
  };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        const k = i++;
        if (k >= items.length) return;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const sonde = await fetch(API, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ source: 'x\n#include "body.typ"\n', instruction: "" }),
}).catch(() => null);
if (!sonde) {
  console.error(`Backend injoignable sur ${API}. Lance-le d'abord : npm run dev (dans backend/).`);
  process.exit(1);
}
if (sonde.status === 503) {
  console.error("ANTHROPIC_API_KEY absente de .env : le banc ne peut pas appeler l'assistant.");
  process.exit(1);
}

const SELECTED = process.env.ONLY ? CASES.filter((c) => process.env.ONLY!.split(",").includes(c.id)) : CASES;
const jobs = SELECTED.flatMap((c) => Array.from({ length: REPS }, (_, r) => ({ c, rep: r + 1 })));
mkdirSync(`${DIR}/${OUT}`, { recursive: true });
writeFileSync(`${DIR}/${OUT}-base-gere.typ`, BASES.gere);
writeFileSync(`${DIR}/base-libre.typ`, BASES.libre);

console.log(`${jobs.length} appels (${SELECTED.length} cas × ${REPS}), ${CONCURRENCY} en parallèle…`);
const runs = await pool(jobs, CONCURRENCY, async ({ c, rep }) => {
  const r = await runOne(c, rep).catch((e: Error) => ({
    id: c.id, rep, base: c.base, instruction: c.instruction, http: 0, ok: false,
    error: `harnais : ${e.message}`, ms: 0,
  } as Run));
  writeFileSync(`${DIR}/${OUT}/${c.id}-${rep}.json`, JSON.stringify(r, null, 1));
  console.log(`  ${r.ok ? "✓" : "✗"} ${c.id} #${rep} — ${Math.round(r.ms / 1000)} s${r.error ? ` — ${r.error}` : ""}`);
  return r;
});

// ── Notation ─────────────────────────────────────────────────────────────────

const rows = runs.map((r) => {
  const c = SELECTED.find((x) => x.id === r.id)!;
  const base = BASES[c.base];
  const before = readLayout(base);
  const after = r.source ? readLayout(r.source) : null;
  const src = r.source ?? "";

  const compiles = r.check?.ok === true;
  const includeCount = (src.match(/#include\s+"body\.typ"/g) ?? []).length;
  const blockKept = before.managed ? src.includes("// dots:layout begin") : !src.includes("// dots:layout");
  // Cohérence JSON ↔ Typst : si régénérer le bloc depuis le JSON ne redonne pas
  // la source, le panneau de mise en page écrasera la modification à la première
  // sauvegarde.
  const coherent = after?.managed && r.source ? applyLayout(r.source, after.layout).trim() === r.source.trim() : null;
  const changed = after && before.managed ? changedPaths(before.layout, after.layout) : [];
  const collateral = c.allowed
    ? changed.filter((p) => !c.allowed!.some((a) => p === a || p.startsWith(`${a}.`)))
    : [];
  const verdict = r.ok
    ? c.check({ source: src, layout: after!.layout, before: before.layout, ok: r.ok, error: r.error })
    : c.check({ source: "", layout: before.layout, before: before.layout, ok: false, error: r.error });

  return {
    id: r.id, rep: r.rep, base: c.base, ok: r.ok, http: r.http, ms: r.ms,
    compiles, pages: r.check?.pages ?? null, warnings: r.check?.warnings?.length ?? 0,
    includeCount, blockKept, coherent, intention: verdict === null, pourquoi: verdict,
    changed, collateral, summary: r.summary ?? r.error ?? "",
  };
});

writeFileSync(`${DIR}/${OUT}-scores.json`, JSON.stringify(rows, null, 1));

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
console.log("\ncas                        rep  http  compile  inclus  bloc  cohérent  intention  collatéral  s");
for (const r of rows) {
  console.log(
    [
      pad(r.id, 26), String(r.rep).padEnd(4), String(r.http).padEnd(5),
      (r.compiles ? "oui" : "NON").padEnd(8), String(r.includeCount).padEnd(7),
      (r.blockKept ? "ok" : "KO").padEnd(5), (r.coherent === null ? "—" : r.coherent ? "oui" : "NON").padEnd(9),
      (r.intention ? "oui" : "NON").padEnd(10), String(r.collateral.length).padEnd(11),
      String(Math.round(r.ms / 1000)),
    ].join(" "),
  );
}
const n = rows.length;
const pc = (k: (r: (typeof rows)[number]) => boolean) => `${rows.filter(k).length}/${n}`;
console.log(`\ncompile : ${pc((r) => r.compiles)} · intention tenue : ${pc((r) => r.intention)} · bloc préservé : ${pc((r) => r.blockKept)} · cohérent : ${rows.filter((r) => r.coherent === true).length}/${rows.filter((r) => r.coherent !== null).length} · sans collatéral : ${pc((r) => r.collateral.length === 0)}`);
console.log(`durée médiane : ${[...rows].map((r) => r.ms).sort((a, b) => a - b)[Math.floor(n / 2)] / 1000} s`);
