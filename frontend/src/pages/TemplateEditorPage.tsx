import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Input, TextArea, VariantType } from "@gouvfr-lasuite/ui-components";
import { Download, Eye, Share, Trash } from "@gouvfr-lasuite/ui-components/icons";
import {
  deleteTemplate,
  fetchFixtures,
  fetchTemplateDetail,
  renderPdf,
  updateTemplate,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import "../components/templates/templates-page.css";

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [saved, setSaved] = useState({ name: "", description: "", source: "" });
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
      setSaved({ name: t.name, description: t.description, source: t.source });
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
      setSaved({ name, description, source });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm(`Supprimer le gabarit « ${name} » ?`)) return;
    await deleteTemplate(id);
    navigate("/");
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

  const dirty = name !== saved.name || description !== saved.description || source !== saved.source;

  /** Navigation interne sans rechargement (même motif que l'éditeur de mise en page). */
  function follow(e: MouseEvent<HTMLElement>, to: string, guard = true) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (guard && dirty && !window.confirm("Modifications non enregistrées : continuer ?")) return;
    navigate(to);
  }

  return (
    <div className="dots-page">
      <div className="dots-page-header">
        <h1>Modifier le gabarit</h1>
        <nav className="editor-modes" aria-label="Mode d'édition">
          <Button
            href={`/t/${id}/layout`}
            variant="tertiary"
            color="neutral"
            size="small"
            onClick={(e) => follow(e, `/t/${id}/layout`)}
          >
            Mise en page
          </Button>
          <Button
            href={`/t/${id}`}
            variant="secondary"
            color="neutral"
            size="small"
            aria-current="page"
            onClick={(e) => follow(e, `/t/${id}`, false)}
          >
            Code Typst
          </Button>
        </nav>
        <div className="dots-actions">
          <Button type="button" variant="secondary" icon={<Download aria-hidden="true" />} onClick={handleDownload}>
            Télécharger .typ
          </Button>
          <Button type="button" variant="secondary" icon={<Share aria-hidden="true" />} onClick={handleShare}>
            Partager
          </Button>
          <Button
            type="button"
            variant="secondary"
            color="error"
            icon={<Trash aria-hidden="true" />}
            onClick={handleDelete}
          >
            Supprimer
          </Button>
        </div>
      </div>

      <div className="editor-fields">
        <Input label="Nom" fullWidth value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Description" fullWidth value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="editor-body">
        <div className="editor-column">
          <TextArea
            label="Source Typst (.typ)"
            variant="classic"
            className="typ-source"
            fullWidth
            rows={22}
            spellCheck={false}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <div className="editor-actions">
            <Button type="button" disabled={saving} onClick={handleSave}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={<Eye aria-hidden="true" />}
              disabled={previewLoading}
              onClick={handlePreview}
            >
              {previewLoading ? "Génération…" : "Prévisualiser"}
            </Button>
          </div>
          {error && (
            // Le kit ne pose pas de rôle sur Alert : l'enveloppe porte la zone vive.
            <div role="alert">
              <Alert type={VariantType.ERROR}>
                <pre className="dots-mono typ-error">{error}</pre>
              </Alert>
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
