import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchDocumentContent,
  fetchDefaultTemplate,
  fetchTemplates,
  type DocsDocumentContent,
  type TemplateSummary,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import { IconDownload, IconLayout, IconLink } from "../components/shell/icons";
import { TemplateTiles } from "../components/compose/TemplateTiles";
import "../components/compose/compose.css";

type DocumentState =
  | { status: "loading" }
  | { status: "loaded"; document: DocsDocumentContent }
  | { status: "error"; message: string };

export function ComposePage() {
  const [searchParams] = useSearchParams();
  const { id: documentId } = useParams<{ id: string }>();

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [documentState, setDocumentState] = useState<DocumentState>({ status: "loading" });
  const [error, setError] = useState<{ error: string; details?: string } | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!documentId) {
      setDocumentState({ status: "error", message: "Document introuvable." });
      return;
    }

    let cancelled = false;
    setDocumentState({ status: "loading" });
    fetchDocumentContent(documentId)
      .then((document) => {
        if (!cancelled) setDocumentState({ status: "loaded", document });
      })
      .catch((e: Error) => {
        if (!cancelled) setDocumentState({ status: "error", message: e.message });
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const fileName = `${documentId || "document"}.pdf`;
  const blockCount =
    documentState.status === "loaded" ? documentState.document.blocks.length : null;

  return (
    <div className="compose">
      <header className="compose-header">
        <h1>{documentState.status === "loaded" ? documentState.document.title : "Document Docs"}</h1>
        <p className="dots-muted compose-header__meta">
          <IconLink size={14} />
          <span>
            {documentId}
            {blockCount !== null && ` · ${blockCount} bloc${blockCount > 1 ? "s" : ""}`}
          </span>
        </p>
      </header>

      <div className="compose-body">
        <aside className="compose-side">
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
        </aside>

        <section className="compose-center">
          <div className="compose-bar">
            {documentState.status === "loading" && <span className="dots-muted">Chargement du document…</span>}
            <a
              className="dots-btn dots-btn--brand dots-btn--small"
              href={undefined}
              download={fileName}
              aria-disabled="true"
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
            {documentState.status === "error" && (
              <div className="dots-notice dots-notice--error compose-error" role="alert">
                <strong>{documentState.message}</strong>
              </div>
            )}
            {documentState.status === "loaded" && (
              <div className="dots-notice compose-notice" role="status">
                Le contenu Docs est chargé. Le rendu PDF depuis ce contenu sera branché dans la prochaine étape.
              </div>
            )}
            <PdfPreview pdfUrl={null} fileName={fileName} />
          </div>
        </section>
      </div>
    </div>
  );
}
