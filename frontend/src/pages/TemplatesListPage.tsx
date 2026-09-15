import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createTemplate, deleteTemplate, fetchTemplates, type TemplateSummary } from "../api/client";
import { TemplateBrowser } from "../components/templates/TemplateBrowser";
import { ViewSwitcher, type TemplateView } from "../components/templates/ViewSwitcher";

const VIEW_STORAGE_KEY = "doc-pdf:templates-view";

function loadStoredView(): TemplateView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function TemplatesListPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TemplateView>(loadStoredView);
  const navigate = useNavigate();

  function reload() {
    setLoading(true);
    fetchTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

  function handleViewChange(next: TemplateView) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // per-viewer convenience only; fine if it can't persist
    }
  }

  async function handleCreate() {
    const name = window.prompt("Nom du nouveau gabarit ?", "Nouveau gabarit");
    if (!name) return;
    const created = await createTemplate({ name, description: "" });
    navigate(`/templates/${created.id}`);
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Supprimer le gabarit « ${name} » ?`)) return;
    await deleteTemplate(id);
    reload();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Gabarits</h1>
        <ViewSwitcher view={view} onChange={handleViewChange} />
      </div>

      {loading ? (
        <div className="page-loading" role="status">Chargement…</div>
      ) : (
        <TemplateBrowser
          templates={templates}
          view={view}
          getOpenHref={(id) => `/templates/${id}`}
          onCreateNew={handleCreate}
          renderActions={(t) => (
            <>
              <Link to={`/documents/new?template=${t.id}`}>Utiliser</Link>
              <button
                type="button"
                className="link-button"
                aria-label={`Supprimer le gabarit ${t.name}`}
                onClick={() => handleDelete(t.id, t.name)}
              >
                Supprimer
              </button>
            </>
          )}
        />
      )}
    </div>
  );
}
