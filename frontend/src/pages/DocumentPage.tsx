import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchDocumentContent,
  fetchDefaultTemplate,
  fetchTemplateDetail,
  fetchTemplates,
  renderDocumentPdf,
  type DocsDocumentContent,
  type RenderInfo,
  type TemplateDetail,
  type TemplateSummary,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import { TemplateTiles } from "../components/compose/TemplateTiles";
import { Button } from "@gouvfr-lasuite/ui-components";
import { Download, StackTemplate } from "@gouvfr-lasuite/ui-components/icons";
import { docsUrl } from "../config";
import "../components/compose/compose.css";

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? "";

  return <DocumentView key={documentId} documentId={documentId} />;
}

type DocumentState =
  | { status: "loading" }
  | { status: "loaded"; document: DocsDocumentContent }
  | { status: "error"; message: string };

type PdfState =
  | { status: "idle" }
  | { status: "ready"; requestKey: string; url: string; info: RenderInfo }
  | { status: "error"; requestKey: string; message: string; details?: string };

type PdfViewState = PdfState | { status: "loading" };

function DocumentView({ documentId }: { documentId: string }) {
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("template");
  const documentUrl = docsUrl(documentId);
  const [state, setState] = useState<DocumentState>({ status: "loading" });
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [templateError, setTemplateError] = useState<{ id: string; message: string } | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<PdfState>({ status: "idle" });
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchDocumentContent(documentId)
      .then((result) => {
        if (!cancelled) setState({ status: "loaded", document: result });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              reason instanceof Error ? reason.message : "Impossible de charger le document.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchTemplates(), fetchDefaultTemplate().catch(() => null)])
      .then(([list, def]) => {
        if (cancelled) return;
        setTemplatesError(null);
        setTemplates(list);
        setDefaultId(def?.id ?? null);
        const initial =
          requestedTemplateId && list.some((template) => template.id === requestedTemplateId)
            ? requestedTemplateId
            : (def?.id ?? list[0]?.id ?? "");
        setTemplateId(initial);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setTemplatesError(
            reason instanceof Error ? reason.message : "Impossible de charger les gabarits.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestedTemplateId]);

  useEffect(() => {
    if (!templateId) return;

    let cancelled = false;
    fetchTemplateDetail(templateId)
      .then((template) => {
        if (cancelled) return;
        setTemplateError(null);
        setSelectedTemplate(template);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setSelectedTemplate(null);
        setTemplateError({
          id: templateId,
          message:
            reason instanceof Error ? reason.message : "Impossible de charger le gabarit.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    const requestKey =
      state.status === "loaded" && templateId ? `${documentId}:${templateId}` : null;
    if (!requestKey) {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      return;
    }

    const controller = new AbortController();
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }

    renderDocumentPdf(documentId, templateId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setPdfState({
            status: "error",
            requestKey,
            message: result.error,
            details: result.details,
          });
          return;
        }

        const url = URL.createObjectURL(result.blob);
        pdfUrlRef.current = url;
        setPdfState({ status: "ready", requestKey, url, info: result.info });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setPdfState({
          status: "error",
          requestKey,
          message: reason instanceof Error ? reason.message : "Impossible de générer le PDF.",
        });
      });

    return () => controller.abort();
  }, [documentId, state.status, templateId]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  const renderRequestKey =
    state.status === "loaded" && templateId ? `${documentId}:${templateId}` : null;
  const activePdfState: PdfViewState =
    renderRequestKey &&
    pdfState.status !== "idle" &&
    pdfState.requestKey === renderRequestKey
      ? pdfState
      : renderRequestKey
        ? { status: "loading" }
        : { status: "idle" };

  const blockCount =
    activePdfState.status === "ready"
      ? activePdfState.info.blockCount
      : state.status === "loaded"
        ? state.document.blocks.length
        : null;
  const updatedAt =
    state.status === "loaded"
      ? new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(state.document.updatedAt))
      : null;
  const selectedTemplateReady = selectedTemplate?.id === templateId ? selectedTemplate : null;
  const selectedTemplateError = templateError?.id === templateId ? templateError.message : null;
  const selectedTemplateLoading = Boolean(
    templateId && !selectedTemplateReady && !selectedTemplateError,
  );
  const fileName = `${documentId || "document"}.pdf`;
  const unsupported =
    activePdfState.status === "ready" ? Object.entries(activePdfState.info.unsupported) : [];
  const unsupportedTotal = unsupported.reduce((total, [, count]) => total + count, 0);

  return (
    <div className="page doc-page">
      <div className="page-header">
        <h1>{state.status === "loaded" ? state.document.title : "Document Docs"}</h1>
        <div className="page-header-actions">
          <a className="button-link secondary-link" href={documentUrl}>
            Ouvrir dans Docs
          </a>
          <Link className="button-link" to="/docs">
            Changer de document
          </Link>
        </div>
      </div>

      <div className="doc-layout">
        <section className="doc-main">
          <section className="doc-panel">
            {state.status === "loading" && (
              <p className="doc-load-status">Chargement du document...</p>
            )}
            {state.status === "error" && (
              <div className="error" role="alert">
                {state.message}
              </div>
            )}
            {state.status === "loaded" && (
              <div className="doc-summary">
                <div>
                  <p className="doc-panel-label">Identifiant</p>
                  <p className="doc-id">{state.document.id}</p>
                </div>
                <div>
                  <p className="doc-panel-label">Contenu</p>
                  <p className="doc-block-count">
                    {blockCount} bloc{blockCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div>
                  <p className="doc-panel-label">Dernière mise à jour</p>
                  <p>{updatedAt}</p>
                </div>
              </div>
            )}
          </section>

          <section className="doc-render" aria-label="Aperçu PDF">
            <div className="doc-render-toolbar">
              <span className="dots-muted" role="status">
                {activePdfState.status === "loading" ? "Génération du PDF..." : ""}
              </span>
              <Button
                size="small"
                icon={<Download aria-hidden="true" />}
                href={activePdfState.status === "ready" ? activePdfState.url : undefined}
                download={activePdfState.status === "ready" ? fileName : undefined}
                disabled={activePdfState.status !== "ready"}
              >
                Télécharger le PDF
              </Button>
            </div>

            {activePdfState.status === "error" && (
              <div className="dots-notice dots-notice--error doc-render-error" role="alert">
                <strong>{activePdfState.message}</strong>
                {activePdfState.details && (
                  <details>
                    <summary>Détails</summary>
                    <pre className="dots-mono">{activePdfState.details}</pre>
                  </details>
                )}
              </div>
            )}

            {unsupportedTotal > 0 && (
              <div className="dots-notice" role="status">
                {unsupportedTotal} bloc{unsupportedTotal > 1 ? "s" : ""} sans équivalent
                Typst ({unsupported.map(([type, count]) => `${type} ×${count}`).join(", ")}) ne
                {unsupportedTotal > 1 ? " figurent" : " figure"} pas dans le PDF.
              </div>
            )}

            <div className="doc-render-preview">
              <PdfPreview
                pdfUrl={activePdfState.status === "ready" ? activePdfState.url : null}
                fileName={fileName}
              />
            </div>
          </section>
        </section>

        <aside className="doc-template-panel" aria-label="Gabarit du document">
          {templatesLoading && <p className="dots-muted">Chargement des gabarits...</p>}
          {templatesError && (
            <div className="dots-notice dots-notice--error" role="alert">
              <strong>{templatesError}</strong>
            </div>
          )}
          {!templatesLoading && !templatesError && templates.length === 0 && (
            <div className="dots-notice">
              Aucun gabarit disponible pour le moment.
            </div>
          )}
          {!templatesLoading && !templatesError && templates.length > 0 && (
            <>
              <TemplateTiles
                templates={templates}
                selectedId={templateId}
                defaultId={defaultId}
                onSelect={setTemplateId}
              />
              {templateId && (
                <Link className="compose-link" to={`/t/${templateId}/layout`}>
                  <StackTemplate size={16} />
                  Mise en page
                </Link>
              )}
              {templateId && (
                <div className="doc-template-detail">
                  {selectedTemplateLoading && (
                    <p className="dots-muted">Chargement du gabarit...</p>
                  )}
                  {selectedTemplateError && (
                    <div className="dots-notice dots-notice--error" role="alert">
                      <strong>{selectedTemplateError}</strong>
                    </div>
                  )}
                  {selectedTemplateReady && (
                    <>
                      <p className="doc-panel-label">Gabarit sélectionné</p>
                      <strong>{selectedTemplateReady.name}</strong>
                      {selectedTemplateReady.description && (
                        <p className="doc-template-description">
                          {selectedTemplateReady.description}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
