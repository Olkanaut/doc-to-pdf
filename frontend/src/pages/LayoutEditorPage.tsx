import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  composeLayout,
  fetchFixtures,
  fetchTemplateAssets,
  fetchTemplateDetail,
  fetchTemplateLayout,
  readLayoutFromSource,
  renderPdf,
  updateTemplate,
  type AiResult,
  type FixtureSummary,
  type LayoutConfig,
  type RenderError,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import { LayoutPanel } from "../components/layout/LayoutPanel";
import { AiPanel } from "../components/layout/AiPanel";
import { IconBack, IconSparkle } from "../components/shell/icons";
import "../components/layout/layout-editor.css";

const COMPOSE_DEBOUNCE_MS = 400;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Une seule vérité : `source`, le .typ complet. Le panneau modifie `layout`, le
 * backend recompose le bloc « dots:layout » → nouvelle `source` → aperçu.
 * L'assistant propose une `source` de remplacement, rendue à la place tant
 * qu'elle n'est ni appliquée ni ignorée.
 */
export function LayoutEditorPage() {
  const { id = "" } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [source, setSource] = useState("");
  const [saved, setSaved] = useState({ name: "", source: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [layout, setLayout] = useState<LayoutConfig | null>(null);
  const [managed, setManaged] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [assets, setAssets] = useState<string[]>([]);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [fixtureId, setFixtureId] = useState("");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<RenderError | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [proposal, setProposal] = useState<AiResult | null>(null);

  // Vrai seulement quand `layout` vient d'un réglage utilisateur : la resynchronisation
  // après une proposition IA pose aussi `layout`, mais ne doit pas recomposer la source.
  const composeWanted = useRef(false);
  const composeSeq = useRef(0);
  const renderSeq = useRef(0);
  const pdfUrlRef = useRef<string | null>(null);

  const dirty = source !== saved.source || name !== saved.name;

  // ── Chargement ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTemplateDetail(id)
      .then((t) => {
        if (cancelled) return;
        setName(t.name);
        setIsDefault(Boolean(t.isDefault));
        setSource(t.source);
        setSaved({ name: t.name, source: t.source });
      })
      .catch((e) => !cancelled && setLoadError(message(e)))
      .finally(() => !cancelled && setLoading(false));
    fetchTemplateLayout(id)
      .then((r) => {
        if (cancelled) return;
        composeWanted.current = false;
        setLayout(r.layout);
        setManaged(r.managed);
      })
      .catch((e) => !cancelled && setLayoutError(message(e)));
    fetchFixtures()
      .then((f) => {
        if (cancelled) return;
        setFixtures(f);
        setFixtureId((cur) => cur || f[0]?.id || "");
      })
      .catch(() => {});
    fetchTemplateAssets()
      .then((a) => !cancelled && setAssets(a.map((x) => x.file)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  // ── Réglage → (400 ms) → composeLayout → nouvelle source ───────────────────
  useEffect(() => {
    if (!layout || !composeWanted.current) return;
    const seq = ++composeSeq.current;
    const timer = setTimeout(async () => {
      try {
        const r = await composeLayout({ source, layout });
        if (seq !== composeSeq.current) return;
        setSource(r.source);
        setManaged(true);
        setLayoutError(null);
      } catch (e) {
        if (seq === composeSeq.current) setLayoutError(`Recomposition impossible : ${message(e)}`);
      }
    }, COMPOSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `source` volontairement hors dépendances : c'est la base au moment du réglage.
  }, [layout]);

  // ── Source (ou proposition) + fixture → aperçu ─────────────────────────────
  const renderSource = proposal ? proposal.source : source;
  useEffect(() => {
    if (!renderSource || !fixtureId) return;
    const seq = ++renderSeq.current;
    const t0 = performance.now();
    setRendering(true);
    renderPdf({ fixtureId, templateSource: renderSource }).then(
      (r) => {
        if (seq !== renderSeq.current) return;
        setRendering(false);
        setRenderMs(Math.round(performance.now() - t0));
        if (r.ok) {
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = URL.createObjectURL(r.blob);
          setPdfUrl(pdfUrlRef.current);
          setRenderError(null);
        } else {
          setRenderError(r);
        }
      },
      (e) => {
        if (seq !== renderSeq.current) return;
        setRendering(false);
        setRenderError({ ok: false, error: message(e) });
      },
    );
  }, [renderSource, fixtureId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleLayoutChange(next: LayoutConfig) {
    composeWanted.current = true;
    setLayout(next);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateTemplate(id, { name, source });
      setSaved({ name, source });
    } catch (e) {
      setSaveError(message(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyProposal(r: AiResult) {
    setProposal(null);
    setSource(r.source);
    // Le bloc dots:layout a pu changer (ou disparaître) : on relit les réglages depuis la source.
    try {
      const read = await readLayoutFromSource(r.source);
      composeWanted.current = false;
      setLayout(read.layout);
      setManaged(read.managed);
    } catch (e) {
      setLayoutError(`Relecture des réglages impossible : ${message(e)}`);
    }
  }

  /** Les liens de l'en-tête quittent la page : on prévient si des modifications ne sont pas enregistrées. */
  function confirmLeave(e: MouseEvent) {
    if (dirty && !window.confirm("Modifications non enregistrées : continuer ?")) e.preventDefault();
  }

  if (loading) return <div className="page-loading" role="status">Chargement…</div>;
  if (loadError) {
    return (
      <div className="dots-page">
        <div className="dots-notice dots-notice--error" role="alert">{loadError}</div>
        <Link to="/templates">Retour aux gabarits</Link>
      </div>
    );
  }

  return (
    <div className="le">
      <header className="le-header">
        <Link to="/templates" className="dots-btn dots-btn--icon" aria-label="Retour aux gabarits" onClick={confirmLeave}>
          <IconBack size={20} />
        </Link>
        <input
          className="le-header__name"
          aria-label="Nom du gabarit"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {isDefault && <span className="dots-badge">Par défaut</span>}
        <nav className="dots-segmented" aria-label="Mode d'édition">
          <Link to={`/templates/${id}/layout`} aria-current="page">Mise en page</Link>
          <Link to={`/templates/${id}`} onClick={confirmLeave}>Code Typst</Link>
        </nav>
        <span className="le-header__spacer" />
        {saveError ? (
          <span className="dots-notice dots-notice--error le-header__status" role="alert">{saveError}</span>
        ) : (
          <span className="dots-muted le-header__status">
            {saving ? "Enregistrement…" : dirty ? "Modifications non enregistrées" : "Enregistré"}
          </span>
        )}
        <button
          type="button"
          className={`dots-btn${aiOpen ? " dots-btn--brand" : ""}`}
          aria-pressed={aiOpen}
          onClick={() => setAiOpen(!aiOpen)}
        >
          <IconSparkle size={18} />
          Assistant IA
        </button>
        {/* Pendant une proposition, l'aperçu ne montre pas `source` : enregistrer serait trompeur. */}
        <button
          type="button"
          className="dots-btn dots-btn--brand"
          disabled={!dirty || saving || proposal !== null}
          onClick={handleSave}
        >
          Enregistrer
        </button>
      </header>

      <div className={`le-body${aiOpen ? " le-body--ai" : ""}`}>
        {layout ? (
          <LayoutPanel
            layout={layout}
            managed={managed}
            assets={assets}
            disabled={proposal !== null}
            onChange={handleLayoutChange}
          />
        ) : (
          <aside className="le-panel" aria-label="Réglages de mise en page">
            <div className="dots-notice dots-notice--error le-panel__notice" role="alert">
              Réglages indisponibles : {layoutError ?? "chargement…"}
            </div>
          </aside>
        )}

        <section className="le-preview" aria-label="Aperçu">
          <div className="le-preview__bar">
            <label>
              Aperçu :
              <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)} aria-label="Document d'exemple">
                {fixtures.length === 0 && <option value="">aucun document d'exemple</option>}
                {fixtures.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
            <span aria-live="polite">
              {rendering
                ? "· recompilation…"
                : renderMs !== null
                  ? `· recompilé à chaque réglage (${renderMs} ms)`
                  : "· recompilé à chaque réglage"}
            </span>
            {proposal && <span className="dots-badge">Proposition — non enregistrée</span>}
          </div>
          <div className="le-preview__doc">
            {layout && layoutError && (
              <div className="dots-notice dots-notice--error" role="alert">{layoutError}</div>
            )}
            {renderError && (
              <div className="dots-notice dots-notice--error le-preview__error" role="alert">
                <strong>Le gabarit ne compile pas : {renderError.error}</strong>
                {renderError.details && (
                  <details>
                    <summary>Sortie de typst</summary>
                    <pre className="dots-mono">{renderError.details}</pre>
                  </details>
                )}
              </div>
            )}
            <PdfPreview pdfUrl={pdfUrl} fileName={`${name || "gabarit"}.pdf`} />
          </div>
        </section>

        {/* Toujours monté : le fil de discussion survit à la fermeture du panneau. */}
        <AiPanel
          open={aiOpen}
          source={source}
          fixtureId={fixtureId}
          templateName={name}
          onProposal={setProposal}
          onApply={handleApplyProposal}
          onDismiss={() => setProposal(null)}
          onClose={() => setAiOpen(false)}
        />
      </div>
    </div>
  );
}
