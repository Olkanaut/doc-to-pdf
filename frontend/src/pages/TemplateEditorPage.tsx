import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteTemplate,
  fetchFixtures,
  fetchTemplateDetail,
  renderPdf,
  updateTemplate,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewFixtureId, setPreviewFixtureId] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchTemplateDetail(id).then((t) => {
      setName(t.name);
      setDescription(t.description);
      setSource(t.source);
      setLoading(false);
    });
    fetchFixtures().then((fixtures) => {
      if (fixtures.length > 0) setPreviewFixtureId(fixtures[0].id);
    });
  }, [id]);

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      await updateTemplate(id, { name, description, source });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm(`Supprimer le gabarit « ${name} » ?`)) return;
    await deleteTemplate(id);
    navigate("/templates");
  }

  function handleDownload() {
    const blob = new Blob([source], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "template"}.typ`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    await navigator.clipboard.writeText(window.location.href);
    window.alert("Lien copié dans le presse-papiers.");
  }

  async function handlePreview() {
    if (!previewFixtureId) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const result = await renderPdf({ fixtureId: previewFixtureId, templateSource: source });
      if (result.ok) {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(result.blob));
      } else {
        setError(result.details ?? result.error);
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) return <div className="page-loading" role="status">Chargement…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Modifier le gabarit</h1>
        <div className="page-header-actions">
          <button type="button" onClick={handleDownload}>
            Télécharger .typ
          </button>
          <button type="button" onClick={handleShare}>
            Partager
          </button>
          <button type="button" className="danger" onClick={handleDelete}>
            Supprimer
          </button>
        </div>
      </div>

      <label className="field">
        <span>Nom</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <div className="editor-body">
        <div className="editor-column">
          <label className="field">
            <span>Source Typst (.typ)</span>
            <textarea
              className="typ-textarea"
              rows={22}
              spellCheck={false}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <div className="editor-actions">
            <button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? "Génération…" : "Prévisualiser"}
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="editor-column">
          <PdfPreview pdfUrl={pdfUrl} fileName={`${name || "gabarit"}.pdf`} />
        </div>
      </div>
    </div>
  );
}
