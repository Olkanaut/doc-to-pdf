import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchFixtures,
  fetchTemplateDetail,
  fetchTemplates,
  renderPdf,
  type FixtureSummary,
  type TemplateSummary,
} from "../api/client";
import { TemplatePicker } from "../components/TemplatePicker";
import { FixturePicker } from "../components/FixturePicker";
import { TemplateEditor } from "../components/TemplateEditor";
import { PdfPreview } from "../components/PdfPreview";

export function ComposePage() {
  const [searchParams] = useSearchParams();
  const preselectedTemplate = searchParams.get("template") ?? "";

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [fixtureId, setFixtureId] = useState("");

  const [editorEnabled, setEditorEnabled] = useState(false);
  const [templateSource, setTemplateSource] = useState("");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ error: string; details?: string } | null>(null);

  useEffect(() => {
    fetchTemplates().then((t) => {
      setTemplates(t);
      const initial = preselectedTemplate && t.some((x) => x.id === preselectedTemplate)
        ? preselectedTemplate
        : t[0]?.id ?? "";
      setTemplateId(initial);
    });
    fetchFixtures().then((f) => {
      setFixtures(f);
      if (f.length > 0) setFixtureId(f[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!templateId) return;
    fetchTemplateDetail(templateId).then((t) => setTemplateSource(t.source));
  }, [templateId]);

  async function handleGenerate() {
    if (!fixtureId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await renderPdf({
        fixtureId,
        ...(editorEnabled ? { templateSource } : { templateId }),
      });
      if (result.ok) {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(result.blob));
      } else {
        setError({ error: result.error, details: result.details });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Créer un document</h1>
      </div>

      <div className="app-body">
        <div className="controls">
          <FixturePicker fixtures={fixtures} selectedId={fixtureId} onSelect={setFixtureId} />
          <TemplatePicker
            templates={templates}
            selectedId={templateId}
            onSelect={(id) => {
              setTemplateId(id);
              setEditorEnabled(false);
            }}
          />
          <TemplateEditor
            source={templateSource}
            enabled={editorEnabled}
            onToggle={setEditorEnabled}
            onChange={setTemplateSource}
          />
          <button type="button" onClick={handleGenerate} disabled={loading || !fixtureId}>
            {loading ? "Génération…" : "Générer le PDF"}
          </button>
          {error && (
            <div className="error" role="alert">
              <strong>{error.error}</strong>
              {error.details && <pre>{error.details}</pre>}
            </div>
          )}
        </div>

        <div className="preview">
          <PdfPreview pdfUrl={pdfUrl} fileName={`${fixtureId || "document"}.pdf`} />
        </div>
      </div>
    </div>
  );
}
