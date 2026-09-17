import type { FastifyInstance, FastifyReply } from "fastify";
import { readdir } from "node:fs/promises";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import { checkTemplateSource, type CheckFailure, type CheckResult } from "../layout/check.js";
import { AiApiError, callMessages, type ContentBlock } from "../ai/client.js";
import { parseAiReply } from "../ai/parse.js";
import { editUserText, fromPdfUserText, systemPrompt } from "../ai/prompt.js";

/** Même forme qu'AiError dans frontend/src/api/client.ts ; `unavailable` fait cacher l'assistant. */
const UNAVAILABLE = {
  ok: false,
  error: "ANTHROPIC_API_KEY absente côté serveur (backend/.env)",
  unavailable: true,
};

/** 6 Mo de base64, soit 4,5 Mo de PDF. */
const MAX_PDF_BASE64 = 6 * 1024 * 1024;

/** Images du dossier partagé d'assets, telles que le gabarit les référence. */
async function listAssets(): Promise<string[]> {
  const files = await readdir(TEMPLATES_ASSETS_DIR).catch(() => [] as string[]);
  return files
    .filter((f) => /\.(png|jpe?g|svg)$/i.test(f))
    .sort()
    .map((f) => `assets/${f}`);
}

/**
 * Compare le rendu proposé au rendu de départ et nomme ce qui a disparu.
 *
 * Trois dégâts compilent proprement et passent tous les autres contrôles : le
 * texte passé en blanc, la police descendue trop bas, et une bande poussée hors
 * de la page par un décalage négatif. Les deux mesures sont complémentaires —
 * l'encre voit la page qui se vide, les mots voient la bande qui s'en va sans
 * que l'encre bouge (mesuré : 5,45 % → 5,07 % d'encre, mais 166 → 163 mots).
 */
async function regressions(avant: CheckResult | CheckFailure, apres: CheckResult): Promise<string[]> {
  if (!avant.ok) return [];
  const out: string[] = [];
  if (avant.ink && apres.ink) {
    // Une bande est jugée à part : vidée, elle ne coûte que quelques pour cent de
    // l'encre totale, ce qu'un seuil sur la page entière ne verra jamais.
    const bandes = [
      ["l'en-tête", avant.ink.top, apres.ink.top],
      ["le pied de page", avant.ink.bottom, apres.ink.bottom],
      ["la page", avant.ink.page, apres.ink.page],
    ] as const;
    for (const [quoi, av, ap] of bandes) {
      if (av > 0.005 && ap < av * 0.5) {
        out.push(
          `${quoi} est passé de ${(av * 100).toFixed(1)} % à ${(ap * 100).toFixed(1)} % de pixels encrés : ` +
            `ce qui s'y trouvait n'est plus visible`,
        );
      }
    }
  }
  if (avant.words !== null && apres.words !== null && apres.words < avant.words) {
    out.push(
      `${avant.words - apres.words} mot(s) ont disparu du PDF (${avant.words} → ${apres.words}) : ` +
        `une mention du gabarit n'est plus rendue, probablement hors de la page`,
    );
  }
  return out;
}

/** Appel, lecture de la réponse, compilation de test : commun aux deux routes. */
async function runAssistant(
  reply: FastifyReply,
  content: ContentBlock[],
  fixtureId?: string,
  sourceAvant?: string,
) {
  let text: string;
  try {
    text = await callMessages({ system: systemPrompt(await listAssets()), content });
  } catch (err) {
    if (err instanceof AiApiError) return reply.code(502).send({ ok: false, error: err.message });
    throw err;
  }
  const parsed = parseAiReply(text);
  if (!parsed) return reply.code(502).send({ ok: false, error: "réponse inexploitable" });
  const check = await checkTemplateSource({ source: parsed.source, fixtureId });
  // Le rendu de départ sert de témoin : on ne signale que ce que la proposition
  // FAIT PERDRE, pas ce qui manquait déjà.
  if (check.ok && sourceAvant) {
    const avant = await checkTemplateSource({ source: sourceAvant, fixtureId });
    check.warnings = [...check.warnings, ...(await regressions(avant, check))];
  }
  return { ok: true, ...parsed, check };
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { source?: string; instruction?: string; fixtureId?: string } }>(
    "/api/ai/template",
    async (req, reply) => {
      if (!process.env.ANTHROPIC_API_KEY) return reply.code(503).send(UNAVAILABLE);
      const { source, instruction, fixtureId } = req.body ?? {};
      if (typeof source !== "string" || !source.trim() || typeof instruction !== "string" || !instruction.trim()) {
        return reply.code(400).send({ ok: false, error: "source et instruction requises" });
      }
      return runAssistant(
        reply,
        [{ type: "text", text: editUserText(source, instruction) }],
        typeof fixtureId === "string" ? fixtureId : undefined,
        source,
      );
    },
  );

  app.post<{ Body: { pdfBase64?: string; name?: string } }>(
    "/api/ai/template-from-pdf",
    // Un PDF de quelques Mo en base64 dépasse la limite Fastify par défaut (1 Mo).
    { bodyLimit: 10 * 1024 * 1024 },
    async (req, reply) => {
      if (!process.env.ANTHROPIC_API_KEY) return reply.code(503).send(UNAVAILABLE);
      const { pdfBase64, name } = req.body ?? {};
      if (typeof pdfBase64 !== "string" || !pdfBase64) {
        return reply.code(400).send({ ok: false, error: "pdfBase64 requis" });
      }
      if (pdfBase64.length > MAX_PDF_BASE64) {
        return reply.code(413).send({ ok: false, error: "PDF trop volumineux (6 Mo de base64 au plus)" });
      }
      // L'API veut du base64 nu : on retire un éventuel préfixe data: et les retours à la ligne.
      const data = pdfBase64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]+=*$/.test(data)) {
        return reply.code(400).send({ ok: false, error: "pdfBase64 n'est pas du base64" });
      }
      return runAssistant(reply, [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: fromPdfUserText(typeof name === "string" ? name : undefined) },
      ]);
    },
  );
}
