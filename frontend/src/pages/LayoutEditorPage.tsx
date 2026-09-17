import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Loader,
  VariantType,
} from "@gouvfr-lasuite/ui-components";
import { Sparkle } from "@gouvfr-lasuite/ui-components/icons";
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
import {
  EditorModeMenu,
  type EditorMode,
} from "../components/layout/EditorModeMenu";
import { TypstCodePanel } from "../components/layout/TypstCodePanel";
import "../components/layout/layout-editor.css";

const COMPOSE_DEBOUNCE_MS = 400;
const READ_LAYOUT_DEBOUNCE_MS = 500;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Fixture d'aperçu de l'éditeur : backend/fixtures/apercu-gabarit.json. */
const PREVIEW_FIXTURE_ID = "apercu-gabarit";

/**
 * Une seule vérité : `source`, le .typ complet. Le panneau modifie `layout`, le
 * backend recompose le bloc « dots:layout » → nouvelle `source` → aperçu.
 * L'assistant propose une `source` de remplacement, rendue à la place tant
 * qu'elle n'est ni appliquée ni ignorée.
 */
export function LayoutEditorPage() {
  const { id = "", mode: rawMode = "layout" } = useParams<{
    id: string;
    mode: string;
  }>();
  const navigate = useNavigate();
  const mode: EditorMode = rawMode === "code" ? "code" : "layout";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [source, setSource] = useState("");
  const [saved, setSaved] = useState({ name: "", description: "", source: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [layout, setLayout] = useState<LayoutConfig | null>(null);
  const [managed, setManaged] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [assets, setAssets] = useState<string[]>([]);
  const [canDeleteAssets, setCanDeleteAssets] = useState(false);
  const [fixtureId, setFixtureId] = useState("");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<RenderError | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [proposal, setProposal] = useState<AiResult | null>(null);

  // Vrai seulement quand `layout` vient d'un réglage utilisateur : la resynchronisation
  // après une proposition IA pose aussi `layout`, mais ne doit pas recomposer la source.
  const composeWanted = useRef(false);
  const readWanted = useRef(false);
  const composeSeq = useRef(0);
  const readSeq = useRef(0);
  const renderSeq = useRef(0);
  const sourceRef = useRef("");
  const layoutRef = useRef<LayoutConfig | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const [composePending, setComposePending] = useState(false);
  const [layoutDraftDirty, setLayoutDraftDirty] = useState(false);
  const [layoutSyncPending, setLayoutSyncPending] = useState(false);

  const dirty =
    source !== saved.source ||
    name !== saved.name ||
    description !== saved.description ||
    composePending ||
    layoutDraftDirty;

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // ── Chargement ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setLayoutError(null);
    setRenderError(null);
    composeWanted.current = false;
    readWanted.current = false;
    setComposePending(false);
    setLayoutDraftDirty(false);
    setLayoutSyncPending(false);
    fetchTemplateDetail(id)
      .then((t) => {
        if (cancelled) return;
        setName(t.name);
        setDescription(t.description);
        setIsDefault(Boolean(t.isDefault));
        setSource(t.source);
        setSaved({
          name: t.name,
          description: t.description,
          source: t.source,
        });
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
        // L'aperçu juge la mise en page, pas le contenu : on prend un document
        // d'exemple sans le proposer au choix. « apercu-gabarit » est écrit pour ça
        // — trois niveaux de titre, un tableau, de l'italique et du gras, et rien
        // d'autre. À défaut, le premier de la liste.
        setFixtureId((cur) => cur || f.find((x) => x.id === PREVIEW_FIXTURE_ID)?.id || f[0]?.id || "");
      })
      .catch(() => {});
    fetchTemplateAssets()
      .then((a) => {
        if (cancelled) return;
        setAssets(a.assets.map((x) => x.file));
        setCanDeleteAssets(a.canDelete);
      })
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
    setComposePending(true);
    const timer = setTimeout(async () => {
      if (!composeWanted.current) return;
      try {
        const r = await composeLayout({ source: sourceRef.current, layout });
        if (seq !== composeSeq.current) return;
        composeWanted.current = false;
        setLayoutDraftDirty(false);
        sourceRef.current = r.source;
        setSource(r.source);
        setManaged(true);
        setLayoutError(null);
      } catch (e) {
        if (seq === composeSeq.current)
          setLayoutError(`Recomposition impossible : ${message(e)}`);
      } finally {
        if (seq === composeSeq.current) setComposePending(false);
      }
    }, COMPOSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `source` volontairement hors dépendances : c'est la base au moment du réglage.
  }, [layout]);

  // ── Code Typst → (500 ms) → relecture des réglages ─────────────────────────
  useEffect(() => {
    if (!readWanted.current) return;
    setLayoutSyncPending(true);
    const timer = setTimeout(() => {
      void syncLayoutFromSource(source);
    }, READ_LAYOUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source]);

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
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = null;
          setPdfUrl(null);
          setRenderError(r);
        }
      },
      (e) => {
        if (seq !== renderSeq.current) return;
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
        setPdfUrl(null);
        setRenderError({ ok: false, error: message(e) });
      },
    );
  }, [renderSource, fixtureId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleLayoutChange(next: LayoutConfig) {
    composeWanted.current = true;
    readWanted.current = false;
    setLayoutDraftDirty(true);
    setLayout(next);
  }

  function handleSourceChange(next: string) {
    composeWanted.current = false;
    readWanted.current = true;
    setComposePending(false);
    setLayoutDraftDirty(false);
    setSource(next);
  }

  async function flushCompose(): Promise<string> {
    const currentLayout = layoutRef.current;
    if (!currentLayout || !composeWanted.current) return sourceRef.current;
    const seq = ++composeSeq.current;
    setComposePending(true);
    try {
      const r = await composeLayout({
        source: sourceRef.current,
        layout: currentLayout,
      });
      if (seq === composeSeq.current) {
        composeWanted.current = false;
        setLayoutDraftDirty(false);
        sourceRef.current = r.source;
        setSource(r.source);
        setManaged(true);
        setLayoutError(null);
      }
      return r.source;
    } catch (e) {
      if (seq === composeSeq.current)
        setLayoutError(`Recomposition impossible : ${message(e)}`);
      throw e;
    } finally {
      if (seq === composeSeq.current) setComposePending(false);
    }
  }

  async function syncLayoutFromSource(input = sourceRef.current) {
    const seq = ++readSeq.current;
    setLayoutSyncPending(true);
    try {
      const read = await readLayoutFromSource(input);
      if (seq !== readSeq.current) return;
      composeWanted.current = false;
      readWanted.current = false;
      setLayoutDraftDirty(false);
      setLayout(read.layout);
      setManaged(read.managed);
      setLayoutError(null);
    } catch (e) {
      if (seq === readSeq.current)
        setLayoutError(`Relecture des réglages impossible : ${message(e)}`);
    } finally {
      if (seq === readSeq.current) setLayoutSyncPending(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const sourceToSave = await flushCompose();
      await updateTemplate(id, { name, description, source: sourceToSave });
      setSaved({ name, description, source: sourceToSave });
    } catch (e) {
      setSaveError(message(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyProposal(r: AiResult) {
    setProposal(null);
    sourceRef.current = r.source;
    setSource(r.source);
    // Le bloc dots:layout a pu changer (ou disparaître) : on relit les réglages depuis la source.
    await syncLayoutFromSource(r.source);
  }

  /**
   * Les liens de l'en-tête sont des Button du kit rendus en <a href> : on garde le href
   * (nouvel onglet, lecteur d'écran) mais un clic simple navigue sans recharger la page,
   * après avoir prévenu si des modifications ne sont pas enregistrées.
   */
  async function follow(
    e: MouseEvent<HTMLElement>,
    to: string,
    guard = true,
    before?: "compose" | "read",
  ) {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    e.preventDefault();
    if (
      guard &&
      dirty &&
      !window.confirm("Modifications non enregistrées : continuer ?")
    )
      return;
    if (before === "compose") await flushCompose();
    if (before === "read") await syncLayoutFromSource();
    navigate(to);
  }

  if (rawMode !== "layout" && rawMode !== "code") {
    return <Navigate to={`/t/${encodeURIComponent(id)}/layout`} replace />;
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
        <Button
          href="/"
          variant="tertiary"
          onClick={(e) => void follow(e, "/", false)}
        >
          Retour aux templates
        </Button>
      </div>
    );
  }

  const layoutHref = `/t/${encodeURIComponent(id)}/layout`;
  const codeHref = `/t/${encodeURIComponent(id)}/code`;
  const modeMenu = (
    <EditorModeMenu
      mode={mode}
      layoutHref={layoutHref}
      codeHref={codeHref}
      onNavigateLayout={(e) => void follow(e, layoutHref, false, "read")}
      onNavigateCode={(e) => void follow(e, codeHref, false, "compose")}
    />
  );
  const status = saving
    ? "Enregistrement…"
    : composePending
      ? "Mise à jour du code…"
      : layoutSyncPending
        ? "Lecture du code…"
        : dirty
          ? "Modifications non enregistrées"
          : "Enregistré";

  return (
    <div className="le">
      <LayoutEditorShell
        mode={mode}
        rightOpen={aiOpen}
        left={
          mode === "code" ? (
            <TypstCodePanel
              source={source}
              templateName={name}
              isDefault={isDefault}
              disabled={proposal !== null}
              modeMenu={modeMenu}
              onSourceChange={handleSourceChange}
              onTemplateNameChange={setName}
            />
          ) : layout ? (
            <LayoutPanel
              layout={layout}
              templateName={name}
              isDefault={isDefault}
              managed={managed}
              assets={assets}
              canDeleteAssets={canDeleteAssets}
              disabled={proposal !== null}
              onChange={handleLayoutChange}
              onTemplateNameChange={setName}
              modeMenu={modeMenu}
              // A visual imported or deleted from the panel changes the assets: the list is re-read.
              onAssetsChanged={() => {
                fetchTemplateAssets()
                  .then((a) => {
                    setAssets(a.assets.map((x) => x.file));
                    setCanDeleteAssets(a.canDelete);
                  })
                  .catch(() => {});
              }}
            />
          ) : (
            <aside className="le-panel" aria-label="Réglages de mise en page">
              <div className="le-panel__notice" role="alert">
                <Alert type={VariantType.ERROR}>
                  Réglages indisponibles : {layoutError ?? "chargement…"}
                </Alert>
              </div>
            </aside>
          )
        }
        center={
          <section className="le-preview" aria-label="Aperçu">
            <div className="le-preview__bar">
              {proposal && (
                <Badge type="accent">Proposition — non enregistrée</Badge>
              )}
              {saveError ? (
                <span
                  className="le-header__status le-header__status--error"
                  role="alert"
                >
                  {saveError}
                </span>
              ) : (
                <span className="le-header__status">{status}</span>
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
              <Button
                variant="primary"
                disabled={!dirty || saving || proposal !== null}
                onClick={handleSave}
              >
                Enregistrer
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
                      <strong>
                        La template ne compile pas : {renderError.error}
                      </strong>
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
              <PdfPreview
                pdfUrl={pdfUrl}
                fileName={`${name || "template"}.pdf`}
              />
            </div>
          </section>
        }
        right={
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
