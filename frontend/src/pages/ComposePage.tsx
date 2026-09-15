import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Select, VariantType } from "@gouvfr-lasuite/ui-components";
import { Download, Link as LinkIcon, StackTemplate } from "@gouvfr-lasuite/ui-components/icons";
import {
  fetchDefaultTemplate,
  fetchDocsDocument,
  fetchFixtures,
  fetchTemplates,
  renderPdfWithInfo,
  type FixtureSummary,
  type RenderInfo,
  type TemplateSummary,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import { TemplateTiles } from "../components/compose/TemplateTiles";
import { DocsUrlField } from "../components/compose/DocsUrlField";
import "../components/compose/compose.css";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valeur du Select « Document d'exemple » quand c'est un document Docs qui est chargé. */
const DOC_OPTION = "docs";

interface LoadedDoc {
  id: string;
  name: string;
  blockCount: number;
  /** URL Docs collée, ou null si le document vient de `?doc=<uuid>`. */
  url: string | null;
}

export function ComposePage() {
  const [searchParams] = useSearchParams();
  const wantedDoc = searchParams.get("doc");

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [fixtureId, setFixtureId] = useState("");

  // Document Docs chargé par le champ URL ou par `?doc=` ; prime sur le document d'exemple.
  const [doc, setDoc] = useState<LoadedDoc | null>(null);
  // Vrai d'emblée avec `?doc=` : le rendu attend le document au lieu de rendre un exemple.
  const [docLoading, setDocLoading] = useState(() => Boolean(wantedDoc && UUID.test(wantedDoc)));
  const [docError, setDocError] = useState<string | null>(null);
  // Numéro du dernier chargement Docs demandé : un résultat plus ancien est jeté.
  const docSeq = useRef(0);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<RenderInfo | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ error: string; details?: string } | null>(null);

  // Numéro du dernier rendu demandé : un résultat plus ancien est jeté.
  const renderSeq = useRef(0);
  // Object URL courant, pour le révoquer au remplacement et au démontage.
  const pdfUrlRef = useRef<string | null>(null);

  async function openDoc(id: string, url: string | null) {
    const seq = ++docSeq.current;
    setDocLoading(true);
    setDocError(null);
    try {
      const loaded = await fetchDocsDocument(id);
      if (seq !== docSeq.current) return; // dépassé par un chargement plus récent
      setDoc({ id: loaded.id, name: loaded.name, blockCount: loaded.blockCount, url });
      setInfo(null);
    } catch (e) {
      if (seq !== docSeq.current) return;
      setDocError((e as Error).message);
    } finally {
      if (seq === docSeq.current) setDocLoading(false);
    }
  }

  useEffect(() => {
    const wanted = searchParams.get("template");
    Promise.all([fetchTemplates(), fetchDefaultTemplate().catch(() => null)])
      .then(([list, def]) => {
        setTemplates(list);
        setDefaultId(def?.id ?? null);
        const initial =
          wanted && list.some((t) => t.id === wanted) ? wanted : (def?.id ?? list[0]?.id ?? "");
        setTemplateId(initial);
      })
      .catch((e: Error) => setError({ error: e.message }));
    fetchFixtures()
      .then((f) => {
        setFixtures(f);
        setFixtureId(f[0]?.id ?? "");
      })
      .catch((e: Error) => setError({ error: e.message }));
    if (wantedDoc && UUID.test(wantedDoc)) void openDoc(wantedDoc.toLowerCase(), null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rendu automatique, 300 ms après le dernier changement de gabarit ou de document.
  const docId = doc?.id ?? null;
  useEffect(() => {
    if (docLoading || !templateId || !(docId || fixtureId)) return;
    const seq = ++renderSeq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const started = performance.now();
      const req = docId ? { docId, templateId } : { fixtureId, templateId };
      const result = await renderPdfWithInfo(req).catch((e: Error) => ({
        ok: false as const,
        error: e.message,
        details: undefined,
      }));
      if (seq !== renderSeq.current) return; // dépassé par un rendu plus récent
      setLoading(false);
      setMs(Math.round(performance.now() - started));
      if (!result.ok) {
        setError({ error: result.error, details: result.details });
        return;
      }
      setError(null);
      setInfo(result.info);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = URL.createObjectURL(result.blob);
      setPdfUrl(pdfUrlRef.current);
    }, 300);
    return () => clearTimeout(timer);
  }, [docLoading, docId, fixtureId, templateId]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  const fixture = fixtures.find((f) => f.id === fixtureId);
  const fileName = `${doc?.id ?? (fixtureId || "document")}.pdf`;
  const blockCount = info?.blockCount ?? doc?.blockCount;
  const blocksLabel = blockCount !== undefined ? ` · ${blockCount} bloc${blockCount > 1 ? "s" : ""}` : "";
  const unsupported = Object.entries(info?.unsupported ?? {});
  const unsupportedTotal = unsupported.reduce((n, [, count]) => n + count, 0);

  return (
    <div className="compose">
      <header className="compose-header">
        <h1>{doc?.name ?? fixture?.name ?? "Document"}</h1>
        <p className="dots-muted compose-header__meta">
          <LinkIcon size={14} aria-hidden="true" />
          {doc ? (
            <>
              <span>Document Docs{blocksLabel}</span>
              {doc.url && (
                <a href={doc.url} target="_blank" rel="noreferrer">
                  Voir dans Docs
                </a>
              )}
            </>
          ) : (
            <span>Document d'exemple{blocksLabel}</span>
          )}
        </p>
        <DocsUrlField onOpen={openDoc} loading={docLoading} error={docError} />
        {unsupportedTotal > 0 && (
          // Le kit ne pose pas de rôle sur Alert : l'enveloppe porte la zone vive.
          <div role="status">
            <Alert type={VariantType.WARNING}>
              {/* Un seul enfant : le contenu de l'Alert est un flex row-reverse (icône à droite). */}
              <span>
                {unsupportedTotal} bloc{unsupportedTotal > 1 ? "s" : ""} sans équivalent Typst (
                {unsupported.map(([type, count]) => `${type} ×${count}`).join(", ")}) ne{" "}
                {unsupportedTotal > 1 ? "figurent" : "figure"} pas dans le PDF.
              </span>
            </Alert>
          </div>
        )}
      </header>

      <div className="compose-body">
        <aside className="compose-side">
          <Select
            label="Document d'exemple"
            name="fixture"
            fullWidth
            clearable={false}
            options={[
              // Le document Docs chargé apparaît en tête ; choisir un exemple l'écarte.
              ...(doc ? [{ label: `Docs · ${doc.name}`, value: DOC_OPTION }] : []),
              ...fixtures.map((f) => ({ label: f.name, value: f.id })),
            ]}
            value={doc ? DOC_OPTION : fixtureId}
            onChange={(e) => {
              const next = e.target.value;
              if (typeof next !== "string" || next === DOC_OPTION) return;
              if (next === fixtureId && !doc) return;
              docSeq.current++; // un chargement Docs encore en vol ne doit plus aboutir
              setDoc(null);
              setDocError(null);
              setDocLoading(false);
              setFixtureId(next);
              setInfo(null);
            }}
          />
          <TemplateTiles
            templates={templates}
            selectedId={templateId}
            defaultId={defaultId}
            onSelect={setTemplateId}
          />
          {templateId && (
            <Link className="compose-link" to={`/templates/${templateId}/layout`}>
              <StackTemplate size={16} aria-hidden="true" />
              Mise en page
            </Link>
          )}
          {ms !== null && (
            <p
              className="dots-muted compose-side__foot"
              title="Durée de la requête de rendu : conversion, compilation Typst et transfert"
            >
              Rendu en {ms} ms
            </p>
          )}
        </aside>

        <section className="compose-center">
          <div className="compose-bar">
            {loading && <span className="dots-muted">Rendu en cours…</span>}
            {/* Sans PDF, `Button` rend un <button disabled> ; avec, un <a download>. */}
            <Button
              size="small"
              icon={<Download aria-hidden="true" />}
              href={pdfUrl ?? undefined}
              download={pdfUrl ? fileName : undefined}
              disabled={!pdfUrl}
            >
              Télécharger le PDF
            </Button>
          </div>
          <div className="compose-preview">
            {error && (
              <div role="alert">
                <Alert type={VariantType.ERROR}>
                  <div className="compose-error">
                    <strong>{error.error}</strong>
                    {error.details && (
                      <details>
                        <summary>Détails</summary>
                        <pre className="dots-mono">{error.details}</pre>
                      </details>
                    )}
                  </div>
                </Alert>
              </div>
            )}
            <PdfPreview pdfUrl={pdfUrl} fileName={fileName} />
          </div>
        </section>
      </div>
    </div>
  );
}
