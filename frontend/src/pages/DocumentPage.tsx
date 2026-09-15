import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchDocumentContent,
  type DocsDocumentContent,
} from "../api/client";

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
  const docsUrl = `${DOCS_ORIGIN}/docs/${encodeURIComponent(documentId)}`;
  const [state, setState] = useState<DocumentState>({ status: "loading" });

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

  return (
    <div className="page">
      <div className="page-header">
        <h1>{state.status === "loaded" ? state.document.title : "Document Docs"}</h1>
        <div className="page-header-actions">
          <a className="button-link secondary-link" href={docsUrl}>
            Ouvrir dans Docs
          </a>
          <Link className="button-link" to={`/documents/new?doc=${encodeURIComponent(documentId)}`}>
            Préparer le PDF
          </Link>
        </div>
      </div>

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
                {state.document.blocks.length} bloc
                {state.document.blocks.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="doc-actions-grid">
        <Link className="doc-action" to="/templates">
          <strong>Gabarits</strong>
          <span>Choisir ou modifier un gabarit Typst.</span>
        </Link>
        <Link className="doc-action" to={`/documents/new?doc=${encodeURIComponent(documentId)}`}>
          <strong>Rendu PDF</strong>
          <span>Préparer le rendu avec le document sélectionné.</span>
        </Link>
      </section>
    </div>
  );
}
