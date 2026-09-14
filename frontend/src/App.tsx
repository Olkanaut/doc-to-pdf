import { useEffect, useState } from "react";
import {
  fetchFixtures,
  fetchTemplateSource,
  fetchTemplates,
  renderPdf,
  type FixtureSummary,
  type TemplateSummary,
} from "./api/client";
import { TemplatePicker } from "./components/TemplatePicker";
import { FixturePicker } from "./components/FixturePicker";
import { TemplateEditor } from "./components/TemplateEditor";
import { PdfPreview } from "./components/PdfPreview";
import "./App.css";

export default function App() {
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
      if (t.length > 0) setTemplateId(t[0].id);
    });
    fetchFixtures().then((f) => {
      setFixtures(f);
      if (f.length > 0) setFixtureId(f[0].id);
    });
  }, []);

  useEffect(() => {
    if (!templateId) return;
    fetchTemplateSource(templateId).then(setTemplateSource);
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
    <div className="app">
      <header className="app-header">
        <h1>Un doc, un PDF</h1>
        <p>Choisissez un gabarit Typst et un document, puis générez le PDF mis en forme.</p>
      </header>

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
          <button onClick={handleGenerate} disabled={loading || !fixtureId}>
            {loading ? "Génération…" : "Générer le PDF"}
          </button>
          {error && (
            <div className="error">
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
