/** Renote des exécutions déjà enregistrées, avec les mêmes contrôles pour toutes. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { BASES, CASES, DIR, changedPaths, flat } from "./cases.js";
import { applyLayout, readLayout } from "../src/layout/layoutTypst.js";
import { mesurer } from "./mesure.js";
import { sanitizeLayout } from "../src/layout/layoutConfig.js";

const OUT = process.argv[2];
// ponytail: script de notation, pas du code de bibliothèque — le type de la ligne
// se lit dans le push plus bas, l'annoter en entier n'apporterait rien.
const rows: Record<string, any>[] = [];
// Référence : le template de départ rendu sur la même fixture.
const ref = {
  gere: await mesurer(BASES.gere, "ref-gere"),
  libre: await mesurer(BASES.libre, "ref-libre"),
};
for (const f of readdirSync(`${DIR}/${OUT}`).sort()) {
  const r = JSON.parse(readFileSync(`${DIR}/${OUT}/${f}`, "utf8"));
  const c = CASES.find((x) => x.id === r.id)!;
  const before = readLayout(BASES[c.base]);
  const after = r.source ? readLayout(r.source) : null;
  const src: string = r.source ?? "";
  const coherent =
    after?.managed && r.source
      ? applyLayout(r.source, after.layout).trim() === r.source.trim()
      : null;
  const changed =
    after && before.managed ? changedPaths(before.layout, after.layout) : [];
  const collateral = c.allowed
    ? changed.filter(
        (p) => !c.allowed!.some((a) => p === a || p.startsWith(`${a}.`)),
      )
    : [];
  const verdict = r.ok
    ? c.check({
        source: src,
        layout: after!.layout,
        before: before.layout,
        ok: true,
      })
    : c.check({
        source: "",
        layout: before.layout,
        before: before.layout,
        ok: false,
        error: r.error,
      });
  // readLayout() passe par sanitizeLayout : une valeur hors bornes est réécrite
  // en silence. On compare au JSON brut pour ne pas noter une valeur que
  // l'assistant n'a jamais écrite.
  const brut = (() => {
    const l = /^\s*\/\/ dots:layout (\{.*\})\s*$/m.exec(src)?.[1];
    if (!l) return null;
    try {
      return JSON.parse(l) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  const borne = brut
    ? Object.entries(flat(brut))
        .filter(
          ([k, v]) =>
            JSON.stringify(flat(sanitizeLayout(brut))[k]) !== JSON.stringify(v),
        )
        .map(([k]) => k)
    : [];
  const m = r.source
    ? await mesurer(r.source, `${OUT}-${r.id}-${r.rep}`)
    : { ok: false, encre: -1, mots: -1, pages: -1 };
  const base = ref[c.base as "gere" | "libre"];
  rows.push({
    id: r.id,
    rep: r.rep,
    base: c.base,
    ok: r.ok,
    ms: r.ms,
    compiles: r.check?.ok === true,
    includeCount: (src.match(/#include\s+"body\.typ"/g) ?? []).length,
    blockKept: before.managed
      ? src.includes("// dots:layout begin")
      : !src.includes("// dots:layout"),
    coherent,
    intention: verdict === null,
    pourquoi: verdict,
    changed,
    collateral,
    /** Lignes posées après le bloc géré : l'échappatoire que le patch demande d'utiliser. */
    apresBloc: src.includes("// dots:layout end")
      ? src
          .split("// dots:layout end")[1]
          .split('#include "body.typ"')[0]
          .split("\n")
          .filter((l) => l.trim()).length
      : 0,
    borne,
    encre: m.encre,
    mots: m.mots,
    pages: m.pages,
    /** Rapport à l'encre du gabarit de départ : < 0,5 = la page s'est vidée. */
    encreRatio:
      base.encre > 0 && m.encre >= 0
        ? Math.round((m.encre / base.encre) * 100) / 100
        : null,
    pagesDelta: m.pages >= 0 ? m.pages - base.pages : null,
    summary: r.summary ?? r.error ?? "",
  });
}
writeFileSync(`${DIR}/${OUT}-scores.json`, JSON.stringify(rows, null, 1));
const n = rows.length;
const pc = (k: (r: (typeof rows)[number]) => boolean) =>
  `${rows.filter(k).length}/${n}`;
const coh = rows.filter((r) => r.coherent !== null);
console.log(
  `${OUT} — compile ${pc((r) => r.compiles)} · intention ${pc((r) => r.intention)} · bloc préservé ${pc((r) => r.blockKept)} · cohérent ${coh.filter((r) => r.coherent).length}/${coh.length} · sans collatéral ${pc((r) => r.collateral.length === 0)} · réponses avec surcharge hors bloc ${pc((r) => r.apresBloc > 0)}`,
);
for (const r of rows.filter((r) => r.borne.length))
  console.log(
    `   ⌦ ${r.id}#${r.rep} — réécrit en silence par sanitizeLayout : ${r.borne.join(", ")}`,
  );
for (const r of rows.filter(
  (r) =>
    r.encreRatio !== null &&
    (r.encreRatio < 0.5 || r.encreRatio > 2 || r.pagesDelta !== 0),
))
  console.log(
    `   ⚠ ${r.id}#${r.rep} — encre ${Math.round((r.encreRatio ?? 0) * 100)} % du gabarit de départ, ${r.mots} mots, ${r.pages} page(s) (${(r.pagesDelta ?? 0) >= 0 ? "+" : ""}${r.pagesDelta})`,
  );
for (const r of rows.filter(
  (r) => !r.intention || r.coherent === false || r.collateral.length,
))
  console.log(
    `   ${r.id}#${r.rep}${!r.intention ? ` — intention: ${r.pourquoi}` : ""}${r.coherent === false ? " — incohérent" : ""}${r.collateral.length ? ` — non demandé: ${r.collateral.join(", ")}` : ""}`,
  );
