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
  ingestPreviewUrl,
  type IngestAnalysis,
  type IngestRect,
  type IngestRegion,
} from "../../api/client";
import { CropCanvas } from "./CropCanvas";
import "./templates-page.css";

const MAX_BYTES = 10 * 1024 * 1024;
/** Un échec d'analyse s'affiche, puis la fenêtre se ferme d'elle-même. */
const ERROR_LINGER_MS = 4000;

type Stage = "drop" | "loading" | "crop" | "docx" | "typ" | "error";
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

interface Props {
  /** « template » crée une template ; « header »/« footer » ne rend qu'un visuel. */
  target?: ImportTarget;
  onClose: () => void;
  /** template créé (ou .typ importé) : son identifiant. */
  onTemplate?: (id: string) => void;
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
  onFragment,
}: Props) {
  const [stage, setStage] = useState<Stage>("drop");
  const [upload, setUpload] = useState<UploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<IngestAnalysis | null>(null);
  const [rect, setRect] = useState<IngestRect | null>(null);
  const [includeHeader, setIncludeHeader] = useState(false);
  const [includeFooter, setIncludeFooter] = useState(false);
  const [differentFirstPage, setDifferentFirstPage] = useState(false);
  const [picked, setPicked] = useState<IngestRegion["kind"] | "custom">("page");
  const [vector, setVector] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Numéro de la lecture en cours : un fichier remplacé pendant son analyse est ignoré.
  const run = useRef(0);

  // Échec d'analyse : le message reste quelques secondes, puis la fenêtre se ferme.
  useEffect(() => {
    if (stage !== "error") return;
    const timer = window.setTimeout(onClose, ERROR_LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [stage, onClose]);

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
      const result = await analyzeDocument(file);
      if (id !== run.current) return;
      setAnalysis(result);

      if (result.docx) {
        const hasHeader = result.docx.bands.some((band) => band.kind === "header");
        const hasFooter =
          result.docx.bands.some((band) => band.kind === "footer") ||
          result.docx.pagination.some((item) => item.kind === "footer");
        setIncludeHeader(target !== "footer" && hasHeader);
        setIncludeFooter(target !== "header" && hasFooter);
        setDifferentFirstPage(result.docx.differentFirstPage);
        setStage("docx");
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

  async function confirm() {
    if (!analysis || (stage === "crop" && !rect)) return;
    if (
      stage === "docx" &&
      target !== "template" &&
      !(target === "header" ? includeHeader : includeFooter)
    ) return;
    setBusy(true);
    setError(null);
    const name =
      upload?.originalFile.name.replace(/\.(pdf|docx)$/i, "") ??
      "template importée";

    try {
      if (stage === "docx") {
        if (target === "template") {
          const created = await createTemplateFromIngest(analysis.jobId, {
            name,
            docx: {
              header: includeHeader,
              footer: includeFooter,
              differentFirstPage,
            },
          });
          onTemplate?.(created.id);
        } else {
          const fragment = await extractFragment(analysis.jobId, {
            docxBand: target,
            kind: target === "header" ? "en-tete" : "pied-de-page",
          });
          onFragment?.(fragment.file);
        }
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

  const cta =
    target === "template" ? "Créer la template" : "Utiliser comme visuel";
  const title =
    target === "template" ? "Nouvelle template" : "Importer un document";

  return (
    <Modal
      isOpen
      size={stage === "crop" || stage === "docx" ? ModalSize.LARGE : ModalSize.MEDIUM}
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
        stage === "crop" || stage === "docx" ? (
          <Button
            type="button"
            disabled={
              busy ||
              (stage === "crop" && !rect) ||
              (stage === "docx" &&
                target !== "template" &&
                !(target === "header" ? includeHeader : includeFooter))
            }
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
      <div className="import-modal__body">
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

        {stage === "docx" && analysis?.docx && (
          <div className="docx-stage">
            <div
              className="docx-stage__preview"
              style={{ aspectRatio: `${analysis.page.widthPt} / ${analysis.page.heightPt}` }}
            >
              <img
                src={ingestPreviewUrl(analysis.jobId)}
                alt="Première page du document Word importé"
              />
            </div>

            <div className="docx-stage__side">
              <fieldset className="docx-stage__choices">
                <legend>Éléments à reprendre</legend>

                {(target === "template" || target === "header") && (
                  <label className="docx-choice">
                    <input
                      type="checkbox"
                      checked={includeHeader}
                      disabled={!analysis.docx.bands.some((band) => band.kind === "header")}
                      onChange={(event) => setIncludeHeader(event.target.checked)}
                    />
                    <span>Reprendre l'en-tête</span>
                  </label>
                )}

                {(target === "template" || target === "footer") && (
                  <label className="docx-choice">
                    <input
                      type="checkbox"
                      checked={includeFooter}
                      disabled={
                        !analysis.docx.bands.some((band) => band.kind === "footer") &&
                        !analysis.docx.pagination.some((item) => item.kind === "footer")
                      }
                      onChange={(event) => setIncludeFooter(event.target.checked)}
                    />
                    <span>Reprendre le pied de page</span>
                  </label>
                )}
              </fieldset>

              {target === "template" && (
                <Switch
                  label="Première page différente"
                  role="switch"
                  fullWidth
                  checked={differentFirstPage}
                  disabled={
                    !analysis.docx.differentFirstPage || (!includeHeader && !includeFooter)
                  }
                  onChange={(event) => setDifferentFirstPage(event.target.checked)}
                />
              )}

              {analysis.docx.warnings.map((warning) => (
                <Alert key={warning} type={VariantType.WARNING}>
                  {warning}
                </Alert>
              ))}
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
          </div>
        )}

        {stage === "crop" && analysis && rect && (
          <div className="crop-stage">
            <CropCanvas
              previewUrl={ingestPreviewUrl(analysis.jobId)}
              pageWidthPt={analysis.page.widthPt}
              pageHeightPt={analysis.page.heightPt}
              value={rect}
              onChange={setRect}
              onCustom={() => setPicked("custom")}
            />

            <div className="crop-stage__side">
              <p className="crop-stage__label">Zone à reprendre</p>

              {analysis.regions.map((region) => (
                <button
                  key={region.kind}
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
                <Alert type={VariantType.WARNING}>
                  Document de {analysis.page.count} pages : seule la première
                  est analysée.
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
      </div>
    </Modal>
  );
}
