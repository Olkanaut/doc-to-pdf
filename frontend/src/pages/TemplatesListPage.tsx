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
        <button onClick={handleCreate}>Nouveau gabarit</button>
      </div>

      {loading ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <ul className="template-list">
          {templates.map((t) => (
            <li key={t.id} className="template-card">
              <div className="template-card-info">
                <h2>{t.name}</h2>
                <p>{t.description || "Sans description"}</p>
              </div>
              <div className="template-card-actions">
                <Link to={`/templates/${t.id}`}>Modifier</Link>
                <Link to={`/documents/new?template=${t.id}`}>Créer un document</Link>
                <button className="link-button" onClick={() => handleDelete(t.id, t.name)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
