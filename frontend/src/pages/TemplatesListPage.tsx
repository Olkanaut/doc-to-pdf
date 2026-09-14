import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createTemplate, deleteTemplate, fetchTemplates, type TemplateSummary } from "../api/client";

export function TemplatesListPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  function reload() {
    setLoading(true);
    fetchTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }

  useEffect(reload, []);

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
      </div>

      {loading ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <div className="template-grid">
          <button className="template-tile template-tile-new" onClick={handleCreate}>
            <span className="template-tile-plus">+</span>
            <span>Nouveau gabarit</span>
          </button>

          {templates.map((t) => (
            <div key={t.id} className="template-tile">
              <Link to={`/templates/${t.id}`} className="template-tile-thumb-link">
                <ThumbnailImage template={t} />
              </Link>
              <div className="template-tile-body">
                <Link to={`/templates/${t.id}`} className="template-tile-title">
                  {t.name}
                </Link>
                <div className="template-tile-actions">
                  <Link to={`/documents/new?template=${t.id}`}>Créer un document</Link>
                  <button className="link-button" onClick={() => handleDelete(t.id, t.name)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThumbnailImage({ template }: { template: TemplateSummary }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="template-tile-thumb template-tile-thumb-fallback">{template.name.slice(0, 1)}</div>;
  }
  return (
    <img
      className="template-tile-thumb"
      src={`/api/templates/${template.id}/thumbnail?v=${encodeURIComponent(template.updatedAt)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
