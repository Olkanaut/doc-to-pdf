import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Badge, Button, Loader, VariantType } from "@gouvfr-lasuite/ui-components";
import { ArrowLeft, Download, Sparkle } from "@gouvfr-lasuite/ui-components/icons";
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
  type LayoutConfig,
  type RenderError,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import { LayoutPanel } from "../components/layout/LayoutPanel";
import { AiPanel } from "../components/layout/AiPanel";
import { LayoutEditorShell } from "../components/layout/LayoutEditorShell";
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
  const navigate = useNavigate();

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
  const [fixtureId, setFixtureId] = useState("");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
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
        // L'aperçu juge la mise en page, pas le contenu : on prend le premier
        // document d'exemple sans le proposer au choix.
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
    renderPdf({ fixtureId, templateSource: renderSource }).then(
      (r) => {
        if (seq !== renderSeq.current) return;
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
        setRenderError({ ok: false, error: message(e) });
      },
    );
  }, [renderSource, fixtureId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Extrait le gabarit tel qu'il est édité, proposition de l'assistant comprise. */
  function handleDownloadTyp() {
    const blob = new Blob([renderSource], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "gabarit"}.typ`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  /**
   * Les liens de l'en-tête sont des Button du kit rendus en <a href> : on garde le href
   * (nouvel onglet, lecteur d'écran) mais un clic simple navigue sans recharger la page,
   * après avoir prévenu si des modifications ne sont pas enregistrées.
   */
  function follow(e: MouseEvent<HTMLElement>, to: string, guard = true) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (guard && dirty && !window.confirm("Modifications non enregistrées : continuer ?")) return;
    navigate(to);
  }

  if (loading) {
    return (
      <div className="le-loading">
        <Loader aria-label="Chargement…" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="le-load-error" role="alert">
        <Alert type={VariantType.ERROR}>{loadError}</Alert>
        <Button href="/" variant="tertiary" onClick={(e) => follow(e, "/", false)}>
          Retour aux gabarits
        </Button>
      </div>
    );
  }

  return (
    <div className="le">
      <header className="le-header">
        <Button
          href="/"
          variant="tertiary"
          color="neutral"
          icon={<ArrowLeft aria-hidden="true" />}
          aria-label="Retour aux gabarits"
          onClick={(e) => follow(e, "/")}
        />
        <input
          className="le-header__name"
          aria-label="Nom du gabarit"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {isDefault && <Badge type="accent">Par défaut</Badge>}
        <nav className="le-header__modes" aria-label="Mode d'édition">
          <Button
            href={`/t/${id}/layout`}
            variant="secondary"
            color="neutral"
            size="small"
            aria-current="page"
            onClick={(e) => follow(e, `/t/${id}/layout`, false)}
          >
            Mise en page
          </Button>
          <Button
            href={`/t/${id}`}
            variant="tertiary"
            color="neutral"
            size="small"
            onClick={(e) => follow(e, `/t/${id}`)}
          >
            Code Typst
          </Button>
        </nav>
        <span className="le-header__spacer" />
        {saveError ? (
          <span className="le-header__status le-header__status--error" role="alert">{saveError}</span>
        ) : (
          <span className="le-header__status">
            {saving ? "Enregistrement…" : dirty ? "Modifications non enregistrées" : "Enregistré"}
          </span>
        )}
        <Button
          variant={aiOpen ? "primary" : "secondary"}
          icon={<Sparkle aria-hidden="true" />}
          aria-pressed={aiOpen}
          onClick={() => setAiOpen(!aiOpen)}
        >
          Assistant IA
        </Button>
        {/* Pendant une proposition, l'aperçu ne montre pas `source` : enregistrer serait trompeur. */}
        <Button variant="primary" disabled={!dirty || saving || proposal !== null} onClick={handleSave}>
          Enregistrer
        </Button>
      </header>

      <LayoutEditorShell
        aiOpen={aiOpen}
        leftPanel={
          layout ? (
            <LayoutPanel
              layout={layout}
              managed={managed}
              assets={assets}
              disabled={proposal !== null}
              onChange={handleLayoutChange}
              // Un visuel importé depuis le panneau s'ajoute aux assets : la liste est relue.
              onAssetsChanged={() => {
                fetchTemplateAssets()
                  .then((a) => setAssets(a.map((x) => x.file)))
                  .catch(() => {});
              }}
            />
          ) : (
            <aside className="le-panel" aria-label="Réglages de mise en page">
              <div className="le-panel__notice" role="alert">
                <Alert type={VariantType.ERROR}>Réglages indisponibles : {layoutError ?? "chargement…"}</Alert>
              </div>
            </aside>
          )
        }
        preview={
          <section className="le-preview" aria-label="Aperçu">
            <div className="le-preview__bar">
              {proposal && <Badge type="accent">Proposition — non enregistrée</Badge>}
              <span className="le-preview__spacer" />
              <Button
                type="button"
                variant="secondary"
                size="small"
                icon={<Download aria-hidden="true" />}
                disabled={!source}
                onClick={handleDownloadTyp}
              >
                Télécharger .typ
              </Button>
            </div>
            <div className="le-preview__doc">
              {layout && layoutError && (
                <div role="alert">
                  <Alert type={VariantType.ERROR}>{layoutError}</Alert>
                </div>
              )}
              {renderError && (
                <div role="alert">
                  <Alert type={VariantType.ERROR}>
                    <div className="le-preview__error">
                      <strong>Le gabarit ne compile pas : {renderError.error}</strong>
                      {renderError.details && (
                        <details>
                          <summary>Sortie de typst</summary>
                          <pre className="le-mono">{renderError.details}</pre>
                        </details>
                      )}
                    </div>
                  </Alert>
                </div>
              )}
              <PdfPreview pdfUrl={pdfUrl} fileName={`${name || "gabarit"}.pdf`} />
            </div>
          </section>
        }
        aiPanel={
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
        }
      />
    </div>
  );
}
