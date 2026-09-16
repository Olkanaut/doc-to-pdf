import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchDocumentContent,
  fetchDefaultTemplate,
  fetchTemplateDetail,
  fetchTemplates,
  type DocsDocumentContent,
  type TemplateDetail,
  type TemplateSummary,
} from "../api/client";
import { TemplateTiles } from "../components/compose/TemplateTiles";
import { IconLayout } from "../components/shell/icons";
import "../components/compose/compose.css";

const DOCS_ORIGIN = "http://localhost:3000";

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? "";

  return <DocumentView key={documentId} documentId={documentId} />;
}

type DocumentState =
  | { status: "loading" }
  | { status: "loaded"; document: DocsDocumentContent }
  | { status: "error"; message: string };

function DocumentView({ documentId }: { documentId: string }) {
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("template");
  const docsUrl = `${DOCS_ORIGIN}/docs/${encodeURIComponent(documentId)}`;
  const [state, setState] = useState<DocumentState>({ status: "loading" });
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [templateError, setTemplateError] = useState<{ id: string; message: string } | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

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

  const blockCount = state.status === "loaded" ? state.document.blocks.length : null;
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

  return (
    <div className="page doc-page">
      <div className="page-header">
        <h1>{state.status === "loaded" ? state.document.title : "Document Docs"}</h1>
        <div className="page-header-actions">
          <a className="button-link secondary-link" href={docsUrl}>
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
                  <IconLayout size={16} />
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
