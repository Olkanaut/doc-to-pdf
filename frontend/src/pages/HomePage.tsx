import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

function extractDocumentId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const docsIndex = segments.indexOf("docs");
    if (docsIndex !== -1 && segments[docsIndex + 1]) {
      return segments[docsIndex + 1];
    }
    return segments.at(-1) ?? "";
  } catch {
    return trimmed.replace(/^\/?docs\//, "").replace(/\/$/, "");
  }
}

export function HomePage() {
  const [documentRef, setDocumentRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const documentId = extractDocumentId(documentRef);
    if (!documentId) {
      setError("Document introuvable.");
      return;
    }

    setError(null);
    const template = searchParams.get("template");
    navigate(
      `/docs/${encodeURIComponent(documentId)}${
        template ? `?template=${encodeURIComponent(template)}` : ""
      }`,
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Document Docs</h1>
        <div className="page-header-actions">
          <Link className="button-link secondary-link" to="/">
            Gabarits
          </Link>
        </div>
      </div>

      <form className="doc-entry" onSubmit={handleSubmit}>
        <label className="field">
          <span>URL ou identifiant Docs</span>
          <input
            autoFocus
            value={documentRef}
            placeholder="http://localhost:3000/docs/..."
            onChange={(event) => setDocumentRef(event.target.value)}
          />
        </label>
        <button type="submit">Ouvrir</button>
      </form>

      {error && (
        <div className="error doc-entry-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
