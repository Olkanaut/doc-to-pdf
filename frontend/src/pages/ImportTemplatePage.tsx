import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Loader, VariantType } from "@gouvfr-lasuite/ui-components";
import {
  analyzePreparedIngest,
  createTemplateFromIngest,
  extractFragment,
  fetchIngestAnalysis,
  ingestAssetUrl,
  ingestPreviewUrl,
  ingestThumbnailUrl,
  previewTemplateFromIngest,
  type IngestAnalysis,
  type IngestPrepared,
  type IngestPreparedPage,
  type IngestRect,
  type IngestResume,
  type TemplateModelV2,
} from "../api/client";
import { ImportVisualEditor } from "../components/templates/import-editor/ImportVisualEditor";
import "../components/templates/templates-page.css";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type PageRole = "first" | "body" | "last" | "custom";

const ROLE_LABELS: Record<PageRole, string> = {
  first: "Première page",
  body: "Page de contenu",
  last: "Dernière page",
  custom: "Custom",
};

interface SelectedPage {
  pageIndex: number;
  role: PageRole;
}

function isPrepared(input: IngestResume): input is IngestPrepared {
  return input.mode === "prepared";
}

function sourceName(input: IngestAnalysis | IngestPrepared | null): string {
  const raw = input?.mode === "prepared"
    ? input.source?.name
    : input?.importModel.source.name;
  return raw?.replace(/\.(pdf|docx)$/i, "") || "Template importée";
}

function defaultSelection(pages: readonly IngestPreparedPage[]): SelectedPage[] {
  if (!pages.length) return [];
  const first = pages[0]!.pageIndex;
  const middle = pages[Math.floor((pages.length - 1) / 2)]!.pageIndex;
  const last = pages[pages.length - 1]!.pageIndex;
  const ordered = [
    { pageIndex: first, role: "first" as const },
    { pageIndex: middle, role: "body" as const },
    { pageIndex: last, role: "last" as const },
  ];
  return ordered.filter((item, index) =>
    ordered.findIndex((candidate) => candidate.pageIndex === item.pageIndex) === index,
  );
}

export function ImportTemplatePage() {
  const { jobId = "" } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [prepared, setPrepared] = useState<IngestPrepared | null>(null);
  const [selectedPages, setSelectedPages] = useState<SelectedPage[]>([]);
  const [analysis, setAnalysis] = useState<IngestAnalysis | null>(null);
  const [templateModel, setTemplateModel] = useState<TemplateModelV2 | null>(null);
  const [name, setName] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewPdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setAnalyzeError(null);
    setCreateError(null);
    fetchIngestAnalysis(jobId)
      .then((result) => {
        if (cancelled) return;
        if (isPrepared(result)) {
          setPrepared(result);
          setSelectedPages(defaultSelection(result.pages));
          setAnalysis(null);
          setTemplateModel(null);
          setSelectedAsset(null);
        } else {
          setPrepared(null);
          setSelectedPages([]);
          setAnalysis(result);
          setTemplateModel(result.templateModel);
          setSelectedAsset(result.assets?.[0]?.id ?? null);
        }
        setName(sourceName(result));
      })
      .catch((error) => !cancelled && setLoadError(message(error)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => () => {
    if (previewPdfUrlRef.current) URL.revokeObjectURL(previewPdfUrlRef.current);
  }, []);

  if (!jobId) return <Navigate to="/" replace />;

  async function rasterizeZone(rect: IngestRect, pageIndex: number): Promise<string> {
    if (!analysis) throw new Error("Import absent");
    const fragment = await extractFragment(analysis.jobId, {
      rect,
      pageIndex,
      vector: false,
      kind: "fragment",
    });
    return fragment.file;
  }

  async function previewTemplate() {
    if (!analysis || !templateModel) return;
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const result = await previewTemplateFromIngest(analysis.jobId, templateModel);
      if (result.ok) {
        if (previewPdfUrlRef.current) URL.revokeObjectURL(previewPdfUrlRef.current);
        previewPdfUrlRef.current = URL.createObjectURL(result.blob);
        setPreviewPdfUrl(previewPdfUrlRef.current);
      } else {
        setPreviewError(result.details || result.error);
      }
    } catch (error) {
      setPreviewError(message(error));
    } finally {
      setPreviewBusy(false);
    }
  }

  async function analyzeSelection() {
    if (!prepared || selectedPages.length < 1) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setCreateError(null);
    try {
      const result = await analyzePreparedIngest(prepared.jobId, selectedPages);
      setPrepared(null);
      setSelectedPages([]);
      setAnalysis(result);
      setTemplateModel(result.templateModel);
      setSelectedAsset(result.assets?.[0]?.id ?? null);
      setName((current) => current.trim() || sourceName(result));
    } catch (error) {
      setAnalyzeError(message(error));
    } finally {
      setAnalyzing(false);
    }
  }

  async function createTemplate() {
    if (!analysis) return;
    if (analysis.mode === "page" && !templateModel) return;
    if (analysis.mode === "assets" && !selectedAsset) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createTemplateFromIngest(analysis.jobId, {
        name: name.trim() || sourceName(analysis),
        templateModel: analysis.mode === "page" ? templateModel! : undefined,
        headerAsset: analysis.mode === "assets" ? selectedAsset : undefined,
      });
      navigate(`/t/${created.id}/layout`);
    } catch (error) {
      setCreateError(message(error));
      setCreating(false);
    }
  }

  return (
    <div className="import-template-page">
      <header className="import-template-page__topbar">
        <div className="import-template-page__title">
          <Button type="button" size="small" color="neutral" variant="tertiary" onClick={() => navigate("/")}>
            Retour
          </Button>
          <div>
            <h1>Importer une template</h1>
            <span>{analysis?.importModel.source.name ?? prepared?.source?.name ?? "Document en cours"}</span>
          </div>
        </div>

        <label className="import-template-page__name">
          Nom
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="import-template-page__actions">
          {prepared ? (
            <Button type="button" disabled={analyzing || selectedPages.length < 1} onClick={() => void analyzeSelection()}>
              {analyzing ? "Analyse…" : "Analyser ces pages"}
            </Button>
          ) : analysis?.mode === "page" && (
            <Button type="button" color="neutral" variant="secondary" disabled={previewBusy || !templateModel} onClick={() => void previewTemplate()}>
              {previewBusy ? "Preview…" : "Preview Typst"}
            </Button>
          )}
          <Button
            type="button"
            disabled={creating || loading || Boolean(prepared) || !analysis || (analysis.mode === "assets" && !selectedAsset)}
            onClick={() => void createTemplate()}
          >
            {creating ? "Création…" : "Créer la template"}
          </Button>
        </div>
      </header>

      {loading && (
        <div className="import-template-page__state" role="status">
          <Loader />
          <span>Chargement de l'import…</span>
        </div>
      )}

      {loadError && (
        <div className="import-template-page__state" role="alert">
          <Alert type={VariantType.ERROR}>{loadError}</Alert>
        </div>
      )}

      {!loading && prepared && (
        <>
          {analyzeError && (
            <div role="alert" className="import-template-page__alert">
              <Alert type={VariantType.ERROR}>{analyzeError}</Alert>
            </div>
          )}
          <PageSelectionWorkspace
            prepared={prepared}
            selectedPages={selectedPages}
            onChange={setSelectedPages}
          />
        </>
      )}

      {!loading && analysis && templateModel && (
        <>
          {(createError || previewError) && (
            <div role="alert" className="import-template-page__alert">
              {createError && <Alert type={VariantType.ERROR}>{createError}</Alert>}
              {previewError && <Alert type={VariantType.ERROR}>{previewError}</Alert>}
            </div>
          )}

          {analysis.mode === "assets" ? (
            <AssetImportWorkspace
              analysis={analysis}
              selectedAsset={selectedAsset}
              onSelect={setSelectedAsset}
            />
          ) : (
            <ImportVisualEditor
              analysis={analysis}
              previewUrl={(pageIndex) => ingestPreviewUrl(analysis.jobId, pageIndex)}
              value={templateModel}
              onChange={setTemplateModel}
              onRasterize={rasterizeZone}
              onPreview={previewTemplate}
              previewPdfUrl={previewPdfUrl}
              previewLoading={previewBusy}
              previewError={null}
              showPreviewButton={false}
            />
          )}
        </>
      )}
    </div>
  );
}

function PageSelectionWorkspace({
  prepared,
  selectedPages,
  onChange,
}: {
  prepared: IngestPrepared;
  selectedPages: SelectedPage[];
  onChange: (pages: SelectedPage[]) => void;
}) {
  const selectedByPage = new Map(selectedPages.map((page) => [page.pageIndex, page]));

  function toggle(pageIndex: number) {
    const existing = selectedByPage.get(pageIndex);
    if (existing) {
      onChange(selectedPages.filter((page) => page.pageIndex !== pageIndex));
      return;
    }
    if (selectedPages.length >= 3) return;
    const nextRole: PageRole = selectedPages.length === 0
      ? "first"
      : selectedPages.length === 1
        ? "body"
        : "last";
    onChange([...selectedPages, { pageIndex, role: nextRole }]);
  }

  function setRole(pageIndex: number, role: PageRole) {
    onChange(selectedPages.map((page) =>
      page.pageIndex === pageIndex ? { ...page, role } : page,
    ));
  }

  return (
    <section className="import-page-selection" aria-label="Pages à analyser">
      <div className="import-page-selection__summary">
        <h2>Pages d'échantillon</h2>
        <span>{selectedPages.length}/3 sélectionnée{selectedPages.length > 1 ? "s" : ""}</span>
      </div>

      <div className="import-page-selection__grid">
        {prepared.pages.map((page) => {
          const selected = selectedByPage.get(page.pageIndex);
          const blocked = !selected && selectedPages.length >= 3;
          return (
            <article
              key={page.id}
              className={`import-page-card${selected ? " import-page-card--on" : ""}${blocked ? " import-page-card--blocked" : ""}`}
            >
              <button
                type="button"
                className="import-page-card__preview"
                aria-pressed={Boolean(selected)}
                disabled={blocked}
                onClick={() => toggle(page.pageIndex)}
              >
                {page.thumbnail ? (
                  <img src={ingestThumbnailUrl(prepared.jobId, page.pageIndex)} alt="" loading="lazy" />
                ) : (
                  <span>Page {page.pageIndex + 1}</span>
                )}
              </button>
              <div className="import-page-card__meta">
                <strong>Page {page.pageIndex + 1}</strong>
                {selected ? (
                  <select value={selected.role} onChange={(event) => setRole(page.pageIndex, event.target.value as PageRole)}>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <option key={role} value={role}>{label}</option>
                    ))}
                  </select>
                ) : (
                  <small>{Math.round(page.widthPt)} × {Math.round(page.heightPt)} pt</small>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AssetImportWorkspace({
  analysis,
  selectedAsset,
  onSelect,
}: {
  analysis: IngestAnalysis;
  selectedAsset: string | null;
  onSelect: (assetId: string) => void;
}) {
  return (
    <div className="import-template-assets">
      <aside className="import-template-assets__panel">
        <h2>Visuels</h2>
        <div className="asset-stage__grid">
          {analysis.assets?.map((asset, index) => (
            <button
              key={asset.id}
              type="button"
              className={`asset-tile${selectedAsset === asset.id ? " asset-tile--on" : ""}`}
              aria-pressed={selectedAsset === asset.id}
              onClick={() => onSelect(asset.id)}
            >
              <img src={ingestAssetUrl(analysis.jobId, index)} alt={asset.name} loading="lazy" />
              <span className="asset-tile__name">{asset.name}</span>
              <span className="asset-tile__meta">
                {asset.vector ? "vectoriel" : "raster"}
                {asset.widthPt > 0 ? ` · ${Math.round(asset.widthPt)} × ${Math.round(asset.heightPt)}` : ""}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="import-template-assets__preview">
        {selectedAsset ? (
          <img
            src={ingestAssetUrl(
              analysis.jobId,
              Math.max(0, analysis.assets?.findIndex((asset) => asset.id === selectedAsset) ?? 0),
            )}
            alt=""
          />
        ) : (
          <span>Aucun visuel sélectionné</span>
        )}
      </section>
    </div>
  );
}
