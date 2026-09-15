import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchDefaultTemplate,
  fetchFixtures,
  fetchTemplates,
  renderPdfWithInfo,
  type FixtureSummary,
  type RenderInfo,
  type TemplateSummary,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import { IconDownload, IconLayout, IconLink, IconWarn } from "../components/shell/icons";
import { TemplateTiles } from "../components/compose/TemplateTiles";
import { DocsUrlField } from "../components/compose/DocsUrlField";
import "../components/compose/compose.css";

export function ComposePage() {
  const [searchParams] = useSearchParams();

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [fixtureId, setFixtureId] = useState("");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<RenderInfo | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ error: string; details?: string } | null>(null);

  // Numéro du dernier rendu demandé : un résultat plus ancien est jeté.
  const renderSeq = useRef(0);
  // Object URL courant, pour le révoquer au remplacement et au démontage.
  const pdfUrlRef = useRef<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rendu automatique, 300 ms après le dernier changement de gabarit ou de document.
  useEffect(() => {
    if (!fixtureId || !templateId) return;
    const seq = ++renderSeq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const started = performance.now();
      const result = await renderPdfWithInfo({ fixtureId, templateId }).catch((e: Error) => ({
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
  }, [fixtureId, templateId]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  const fixture = fixtures.find((f) => f.id === fixtureId);
  const fileName = `${fixtureId || "document"}.pdf`;
  const unsupported = Object.entries(info?.unsupported ?? {});
  const unsupportedTotal = unsupported.reduce((n, [, count]) => n + count, 0);

  return (
    <div className="compose">
      <header className="compose-header">
        <h1>{fixture?.name ?? "Document"}</h1>
        <p className="dots-muted compose-header__meta">
          <IconLink size={14} />
          <span>Document d'exemple{info && ` · ${info.blockCount} bloc${info.blockCount > 1 ? "s" : ""}`}</span>
        </p>
        <DocsUrlField />
        {unsupportedTotal > 0 && (
          <div className="dots-notice dots-notice--warn" role="status">
            <IconWarn size={18} />
            <span>
              {unsupportedTotal} bloc{unsupportedTotal > 1 ? "s" : ""} sans équivalent Typst (
              {unsupported.map(([type, count]) => `${type} ×${count}`).join(", ")}) ne{" "}
              {unsupportedTotal > 1 ? "figurent" : "figure"} pas dans le PDF.
            </span>
          </div>
        )}
      </header>

      <div className="compose-body">
        <aside className="compose-side">
          <label className="dots-field">
            <span>Document d'exemple</span>
            <select
              value={fixtureId}
              onChange={(e) => {
                setFixtureId(e.target.value);
                setInfo(null);
              }}
            >
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <TemplateTiles
            templates={templates}
            selectedId={templateId}
            defaultId={defaultId}
            onSelect={setTemplateId}
          />
          {templateId && (
            <Link className="compose-link" to={`/templates/${templateId}/layout`}>
              <IconLayout size={16} />
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
            <a
              className="dots-btn dots-btn--brand dots-btn--small"
              href={pdfUrl ?? undefined}
              download={fileName}
              aria-disabled={pdfUrl ? undefined : true}
            >
              <IconDownload size={16} />
              Télécharger le PDF
            </a>
          </div>
          <div className="compose-preview">
            {error && (
              <div className="dots-notice dots-notice--error compose-error" role="alert">
                <strong>{error.error}</strong>
                {error.details && (
                  <details>
                    <summary>Détails</summary>
                    <pre className="dots-mono">{error.details}</pre>
                  </details>
                )}
              </div>
            )}
            <PdfPreview pdfUrl={pdfUrl} fileName={fileName} />
          </div>
        </section>
      </div>
    </div>
  );
}
