import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  FileUploader,
  Loader,
  Modal,
  ModalSize,
  Switch,
  VariantType,
  type UploadFile,
} from "@gouvfr-lasuite/ui-components";
import { XMark } from "@gouvfr-lasuite/ui-components/icons";
import {
  analyzeDocument,
  checkTemplateSource,
  createTemplate,
  createTemplateFromIngest,
  extractFragment,
  ingestAssetUrl,
  ingestPreviewUrl,
  prepareDocument,
  previewTemplateFromIngest,
  type IngestAnalysis,
  type IngestAsset,
  type IngestRect,
  type IngestRegion,
  type TemplateModelV2,
} from "../../api/client";
import { CropCanvas } from "./CropCanvas";
import { ImportVisualEditor } from "./import-editor/ImportVisualEditor";
import "./templates-page.css";

const MAX_BYTES = 10 * 1024 * 1024;
/** Un échec d'analyse s'affiche, puis la fenêtre se ferme d'elle-même. */
const ERROR_LINGER_MS = 4000;

type Stage = "drop" | "loading" | "crop" | "assets" | "edit" | "typ" | "error";
/** Ce à quoi sert la zone choisie : une template entière, ou le seul visuel d'une section. */
export type ImportTarget = "template" | "header" | "footer";

const REGION_LABEL: Record<IngestRegion["kind"], string> = {
  header: "En-tête détecté",
  footer: "Pied de page détecté",
  page: "Page entière",
};

function ko(bytes: number): string {
  return (bytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function toRect(region: IngestRegion): IngestRect {
  return {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  };
}

function pageFor(analysis: IngestAnalysis, pageIndex: number) {
  return analysis.importModel.pages.find((page) => page.pageIndex === pageIndex)
    ?? (pageIndex === 0
      ? {
          id: "page-1",
          pageIndex: 0,
          widthPt: analysis.page.widthPt,
          heightPt: analysis.page.heightPt,
          rotation: 0 as const,
        }
      : null);
}

function cropRegionsForPage(analysis: IngestAnalysis, pageIndex: number): IngestRegion[] {
  if (pageIndex === 0 && analysis.regions.length) return analysis.regions;
  const page = pageFor(analysis, pageIndex);
  if (!page) return [];
  const zoneRegions: IngestRegion[] = analysis.importModel.zones
    .filter((zone) => zone.pageIndex === pageIndex && (zone.kind === "header" || zone.kind === "footer"))
    .map((zone) => ({
      kind: zone.kind === "footer" ? "footer" : "header",
      x: zone.bbox.x,
      y: zone.bbox.y,
      width: zone.bbox.width,
      height: zone.bbox.height,
      vector: false,
    }));
  return [
    ...zoneRegions,
    { kind: "page", x: 0, y: 0, width: page.widthPt, height: page.heightPt, vector: false },
  ];
}

function preferredCropRegion(analysis: IngestAnalysis, pageIndex: number, target: ImportTarget): IngestRegion | null {
  const regions = cropRegionsForPage(analysis, pageIndex);
  const wanted = target === "footer" ? "footer" : target === "header" ? "header" : "page";
  return regions.find((region) => region.kind === wanted)
    ?? regions.find((region) => region.kind === "page")
    ?? null;
}

interface Props {
  /** « template » crée une template ; « header »/« footer » ne rend qu'un visuel. */
  target?: ImportTarget;
  onClose: () => void;
  /** template créé (ou .typ importé) : son identifiant. */
  onTemplate?: (id: string) => void;
  /** Import analysé, à reprendre dans une page dédiée. */
  onImportReady?: (jobId: string) => void;
  /** Visuel découpé, à poser dans la section d'où la fenêtre a été ouverte. */
  onFragment?: (file: string) => void;
}

/**
 * Entrée unique de l'import : un seul dépôt pour .typ, .pdf et .docx.
 *
 * Un .typ passe la compilation de test et ouvre l'éditeur. Un PDF ou un .docx
 * est analysé (marges, police, couleurs, bandes d'en-tête et de pied), puis
 * l'utilisateur confirme ou trace la zone à reprendre.
 *
 * Il n'y a ni « Annuler » ni « Retour » : la croix ferme et abandonne le
 * fichier déposé, que le serveur finit par balayer avec son dossier d'import.
 */
export function ImportDocumentModal({
  target = "template",
  onClose,
  onTemplate,
  onImportReady,
  onFragment,
}: Props) {
  const [stage, setStage] = useState<Stage>("drop");
  const [upload, setUpload] = useState<UploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<IngestAnalysis | null>(null);
  const [templateModel, setTemplateModel] = useState<TemplateModelV2 | null>(null);
  const [rect, setRect] = useState<IngestRect | null>(null);
  const [cropPageIndex, setCropPageIndex] = useState(0);
  /** Mode « assets » : visuel retenu parmi ceux sortis du .docx. */
  const [asset, setAsset] = useState<IngestAsset | null>(null);
  const [picked, setPicked] = useState<IngestRegion["kind"] | "custom">("page");
  const [vector, setVector] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Numéro de la lecture en cours : un fichier remplacé pendant son analyse est ignoré.
  const run = useRef(0);

  // Échec d'analyse : le message reste quelques secondes, puis la fenêtre se ferme.
  useEffect(() => {
    if (stage !== "error") return;
    const timer = window.setTimeout(onClose, ERROR_LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [stage, onClose]);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    };
  }, [previewPdfUrl]);

  function fail(message: string) {
    setError(message);
    setStage("error");
  }

  /** Bouton « Continuer sans import » : même création qu'une template vide, sans passer par un fichier. */
  async function createBlank() {
    setBusy(true);
    setError(null);
    try {
      const created = await createTemplate({
        name: "Nouvelle template",
        description: "",
      });
      onTemplate?.(created.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function choose(next: UploadFile) {
    run.current += 1;
    const id = run.current;
    const file = next.originalFile;
    setError(null);

    if (!/\.(typ|pdf|docx)$/i.test(file.name)) {
      setUpload({
        ...next,
        status: "error",
        error: "Déposez un .typ, un .pdf ou un .docx.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      setUpload({
        ...next,
        status: "error",
        error: `Fichier trop volumineux (${ko(file.size)} Ko) : 10 Mo au plus.`,
      });
      return;
    }
    setUpload({ ...next, status: "done" });

    if (/\.typ$/i.test(file.name)) {
      await importTyp(file, id);
      return;
    }

    setStage("loading");
    try {
      const result = target === "template" && onImportReady
        ? await prepareDocument(file)
        : await analyzeDocument(file);
      if (id !== run.current) return;

      if (target === "template" && onImportReady) {
        onImportReady(result.jobId);
        return;
      }

      if (result.mode === "prepared") {
        fail("Sélection de pages requise pour analyser ce document.");
        return;
      }

      setAnalysis(result);
      setTemplateModel(result.templateModel);
      setCropPageIndex(0);

      // Un .docx qui porte ses visuels en clair n'a pas de page rendue : il n'y
      // a rien à recadrer, seulement un visuel à choisir.
      if (result.mode === "assets") {
        const wanted = target === "footer" ? "footer" : "header";
        const first =
          result.assets?.find((a) => a.kind === wanted) ??
          result.assets?.[0] ??
          null;
        setAsset(first);
        setStage("assets");
        return;
      }

      if (target === "template") {
        setStage("edit");
        return;
      }

      // La zone proposée par défaut est celle qui correspond à la demande :
      // l'en-tête quand la fenêtre vient de la section En-tête, la page sinon.
      const wanted =
        target === "header"
          ? "header"
          : target === "footer"
            ? "footer"
            : "header";
      const region =
        result.regions.find((r) => r.kind === wanted) ??
        result.regions.find((r) => r.kind === "page")!;
      setPicked(region.kind);
      setRect(toRect(region));
      setVector(region.vector);
      setStage("crop");
    } catch (err) {
      if (id !== run.current) return;
      fail((err as Error).message);
    }
  }

  /** Branche .typ : compilation de test, création, puis l'éditeur. */
  async function importTyp(file: File, id: number) {
    setStage("loading");
    try {
      const source = await file.text();
      if (id !== run.current) return;
      const check = await checkTemplateSource({ source });
      if (id !== run.current) return;
      if (!check.ok) {
        fail(check.error ?? "Ce .typ ne compile pas.");
        return;
      }
      const created = await createTemplate({
        name: file.name.replace(/\.typ$/i, ""),
        description: `Importé depuis ${file.name}`,
        source,
      });
      if (id !== run.current) return;
      setNotice(`${file.name} importé — compilation de test réussie.`);
      setStage("typ");
      onTemplate?.(created.id);
    } catch (err) {
      if (id !== run.current) return;
      fail((err as Error).message);
    }
  }

  function selectRegion(region: IngestRegion) {
    setPicked(region.kind);
    setRect(toRect(region));
    setVector(region.vector);
  }

  function selectCropPage(pageIndex: number) {
    if (!analysis) return;
    const region = preferredCropRegion(analysis, pageIndex, target);
    if (!region) return;
    setCropPageIndex(pageIndex);
    setPicked(region.kind);
    setRect(toRect(region));
    setVector(region.vector);
  }

  async function confirm() {
    if (!analysis || (stage === "crop" ? !rect : stage === "assets" ? !asset : stage === "edit" ? !templateModel : true)) return;
    setBusy(true);
    setError(null);
    const name =
      upload?.originalFile.name.replace(/\.(pdf|docx)$/i, "") ??
      "template importée";

    try {
      if (stage === "assets") {
        if (target === "template") {
          const created = await createTemplateFromIngest(analysis.jobId, {
            name,
            headerAsset: asset!.id,
          });
          onTemplate?.(created.id);
        } else {
          const fragment = await extractFragment(analysis.jobId, {
            asset: asset!.id,
            kind: target === "header" ? "en-tete" : "pied-de-page",
          });
          onFragment?.(fragment.file);
        }
        onClose();
        return;
      }

      if (stage === "edit") {
        const created = await createTemplateFromIngest(analysis.jobId, {
          name,
          templateModel: templateModel!,
        });
        onTemplate?.(created.id);
        onClose();
        return;
      }

      if (target === "template") {
        // Sans recadrage, la page entière : la template ne reprend alors que le
        // relevé (format, marges, typographie), sans bandeau.
        const whole = picked === "page";
        const created = await createTemplateFromIngest(analysis.jobId, {
          name,
          header: whole ? null : picked === "footer" ? null : rect,
          footer: picked === "footer" ? rect : null,
          vector,
        });
        onTemplate?.(created.id);
      } else {
        const fragment = await extractFragment(analysis.jobId, {
          rect: rect!,
          pageIndex: cropPageIndex,
          vector,
          kind: target === "header" ? "en-tete" : "pied-de-page",
        });
        onFragment?.(fragment.file);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function previewEditedTemplate() {
    if (!analysis || !templateModel) return;
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const result = await previewTemplateFromIngest(analysis.jobId, templateModel);
      if (result.ok) {
        if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
        setPreviewPdfUrl(URL.createObjectURL(result.blob));
      } else {
        setPreviewError(result.details || result.error);
      }
    } catch (err) {
      setPreviewError((err as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function rasterizeEditedZone(rect: IngestRect, pageIndex: number): Promise<string> {
    if (!analysis) throw new Error("Import absent");
    const fragment = await extractFragment(analysis.jobId, {
      rect,
      pageIndex,
      vector: false,
      kind: "fragment",
    });
    return fragment.file;
  }

  const cta =
    target === "template" ? "Créer la template" : "Utiliser comme visuel";
  const title =
    target === "template" ? "Nouvelle template" : "Importer un document";

  return (
    <Modal
      isOpen
      size={stage === "crop" || stage === "edit" ? ModalSize.LARGE : ModalSize.MEDIUM}
      onClose={onClose}
      closeOnClickOutside
      hideCloseButton
      // Le titre est un nœud React : sans aria-label, react-modal nommerait la
      // boîte « [object Object] » (même contournement que dans Docs).
      aria-label={title}
      title={
        <div className="import-modal__head">
          <h2 className="import-modal__title">{title}</h2>
          <div className="import-modal__close">
            <Button
              type="button"
              size="small"
              color="neutral"
              variant="tertiary"
              aria-label="Fermer"
              icon={<XMark aria-hidden="true" />}
              onClick={onClose}
            />
          </div>
        </div>
      }
      rightActions={
        stage === "crop" || stage === "assets" || stage === "edit" ? (
          <Button
            type="button"
            disabled={busy || (stage === "crop" ? !rect : stage === "assets" ? !asset : !templateModel)}
            onClick={() => void confirm()}
          >
            {busy ? "En cours…" : cta}
          </Button>
        ) : stage === "drop" && target === "template" && !upload ? (
          // Masqué dès qu'un fichier est déposé : le dépôt devient alors la seule action en cours.
          <Button
            type="button"
            disabled={busy}
            onClick={() => void createBlank()}
          >
            {busy ? "En cours…" : "Continuer sans import"}
          </Button>
        ) : undefined
      }
    >
      <div className={`import-modal__body${stage === "edit" ? " import-modal__body--editor" : ""}`}>
        {stage === "drop" && (
          <FileUploader
            name="document"
            accept=".typ,.pdf,.docx"
            maxSize={MAX_BYTES}
            files={upload ? [upload] : []}
            onAddFiles={(files) => {
              if (files[0]) void choose(files[0]);
            }}
            onRemoveFile={() => setUpload(null)}
            labels={{
              noFileYet: "Déposez un fichier .typ, .pdf ou .docx",
              clickToUpload: "ou cliquez pour parcourir",
              maxSize: "10 Mo max, un seul fichier",
              remove: "Retirer le fichier",
            }}
          />
        )}

        {stage === "loading" && (
          <div className="import-modal__wait" role="status">
            <Loader />
            <span>Analyse de {upload?.originalFile.name}…</span>
          </div>
        )}

        {stage === "typ" && notice && (
          <Alert type={VariantType.SUCCESS}>{notice}</Alert>
        )}

        {stage === "error" && error && (
          <div role="alert">
            <Alert type={VariantType.ERROR}>{error}</Alert>
          </div>
        )}

        {/* Mode « assets » : pas de page rendue, donc pas de recadrage — les
            visuels sortent du .docx tels quels et il n'y a qu'à choisir. */}
        {stage === "assets" && analysis && (
          <div className="asset-stage">
            <p className="crop-stage__label">
              Visuels trouvés dans le document
              {analysis.assets && analysis.assets.length > 1
                ? ` (${analysis.assets.length})`
                : ""}
            </p>

            <div className="asset-stage__grid">
              {analysis.assets?.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`asset-tile${asset?.id === item.id ? " asset-tile--on" : ""}`}
                  aria-pressed={asset?.id === item.id}
                  onClick={() => setAsset(item)}
                >
                  <img
                    src={ingestAssetUrl(analysis.jobId, index)}
                    alt={item.name}
                    loading="lazy"
                  />
                  <span className="asset-tile__name">{item.name}</span>
                  <span className="asset-tile__meta">
                    {item.vector ? "vectoriel" : "raster"}
                    {item.widthPt > 0
                      ? ` · ${Math.round(item.widthPt)} × ${Math.round(item.heightPt)}`
                      : ""}
                    {item.kind !== "body"
                      ? ` · ${item.kind === "header" ? "en-tête" : "pied de page"}`
                      : ""}
                  </span>
                </button>
              ))}
            </div>

            <Alert type={VariantType.INFO}>
              Le document portait ses visuels en clair : ils sont repris tels
              quels, sans passer par une image de la page. Format et marges
              viennent de sa mise en page Word.
            </Alert>

            {analysis.fontSubstitution && (
              <Alert type={VariantType.WARNING}>
                {analysis.fontSubstitution} n'est pas installée sur le serveur :
                Marianne la remplace.
              </Alert>
            )}
            {error && (
              <div role="alert">
                <Alert type={VariantType.ERROR}>{error}</Alert>
              </div>
            )}
          </div>
        )}

        {stage === "crop" && analysis && rect && (
          <div className="crop-stage">
            <div className="crop-stage__canvas">
              {analysis.importModel.pages.length > 1 && (
                <div className="import-page-tabs" aria-label="Pages du document">
                  {analysis.importModel.pages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      className={`import-page-tab${cropPageIndex === page.pageIndex ? " import-page-tab--on" : ""}`}
                      aria-pressed={cropPageIndex === page.pageIndex}
                      onClick={() => selectCropPage(page.pageIndex)}
                    >
                      Page {page.pageIndex + 1}
                    </button>
                  ))}
                </div>
              )}
              <CropCanvas
                previewUrl={ingestPreviewUrl(analysis.jobId, cropPageIndex)}
                pageWidthPt={pageFor(analysis, cropPageIndex)?.widthPt ?? analysis.page.widthPt}
                pageHeightPt={pageFor(analysis, cropPageIndex)?.heightPt ?? analysis.page.heightPt}
                value={rect}
                onChange={setRect}
                onCustom={() => setPicked("custom")}
              />
            </div>

            <div className="crop-stage__side">
              <p className="crop-stage__label">Zone à reprendre</p>

              {cropRegionsForPage(analysis, cropPageIndex).map((region) => (
                <button
                  key={`${cropPageIndex}-${region.kind}`}
                  type="button"
                  className={`crop-opt${picked === region.kind ? " crop-opt--on" : ""}`}
                  aria-pressed={picked === region.kind}
                  onClick={() => selectRegion(region)}
                >
                  <span className="crop-opt__radio" aria-hidden="true" />
                  {REGION_LABEL[region.kind]}
                </button>
              ))}

              {/* N'existe qu'une fois une zone tracée à la main. */}
              <span
                className={`crop-opt crop-opt--custom${picked === "custom" ? " crop-opt--on" : ""}`}
              >
                <span className="crop-opt__radio" aria-hidden="true" />
                Zone personnalisée
              </span>

              <hr className="crop-stage__rule" />

              <Switch
                label="Extraire en vectoriel (SVG)"
                role="switch"
                fullWidth
                checked={vector}
                onChange={(e) => setVector(e.target.checked)}
              />

              {analysis.page.count > 1 && (
                <Alert type={VariantType.INFO}>
                  Document de {analysis.page.count} pages : choisissez la page
                  avant de tracer la zone.
                </Alert>
              )}
              {analysis.fontSubstitution && (
                <Alert type={VariantType.WARNING}>
                  {analysis.fontSubstitution} n'est pas installée sur le serveur
                  : Marianne la remplace.
                </Alert>
              )}
              {error && (
                <div role="alert">
                  <Alert type={VariantType.ERROR}>{error}</Alert>
                </div>
              )}
            </div>
          </div>
        )}

        {stage === "edit" && analysis && templateModel && (
          <ImportVisualEditor
            analysis={analysis}
            previewUrl={(pageIndex) => ingestPreviewUrl(analysis.jobId, pageIndex)}
            value={templateModel}
            onChange={setTemplateModel}
            onRasterize={rasterizeEditedZone}
            onPreview={previewEditedTemplate}
            previewPdfUrl={previewPdfUrl}
            previewLoading={previewBusy}
            previewError={previewError}
          />
        )}
      </div>
    </Modal>
  );
}
