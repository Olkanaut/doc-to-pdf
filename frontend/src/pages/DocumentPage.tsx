import { Link, useParams } from "react-router-dom";

const DOCS_ORIGIN = "http://localhost:3000";

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? "";
  const docsUrl = `${DOCS_ORIGIN}/docs/${encodeURIComponent(documentId)}`;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Document Docs</h1>
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
        <p className="doc-panel-label">Identifiant</p>
        <p className="doc-id">{documentId}</p>
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
