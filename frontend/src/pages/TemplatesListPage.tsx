import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createTemplate,
  deleteTemplate,
  fetchDefaultTemplate,
  fetchTemplates,
  setDefaultTemplate,
  type TemplateSummary,
} from "../api/client";
import { ImportTemplateModal } from "../components/templates/ImportTemplateModal";
import { TemplateBrowser } from "../components/templates/TemplateBrowser";
import { ViewSwitcher, type TemplateView } from "../components/templates/ViewSwitcher";
import { IconStar } from "../components/shell/icons";
import "../components/templates/templates-page.css";

const VIEW_STORAGE_KEY = "doc-pdf:templates-view";

function loadStoredView(): TemplateView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** Liste des gabarits utilisateur. */
export function TemplatesListPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TemplateView>(loadStoredView);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    setError(null);
    // Le gabarit par défaut arrive par `isDefault` dans la liste ou par
    // /templates/default (null tant que la route manque ou qu'aucun n'est défini).
    Promise.all([fetchTemplates(), fetchDefaultTemplate().catch(() => null)])
      .then(([list, def]) =>
        setTemplates(list.map((t) => ({ ...t, isDefault: t.isDefault ?? t.id === def?.id }))),
      )
      .catch((e: Error) => setError(e.message))
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

  async function handleSetDefault(id: string) {
    setError(null);
    try {
      await setDefaultTemplate(id);
      reload();
    } catch (e) {
      setError(`Impossible de définir le gabarit par défaut : ${(e as Error).message}`);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const created = await createTemplate({ name: "Nouveau gabarit", description: "" });
      navigate(`/t/${created.id}/layout`);
    } catch (e) {
      setError(`Création impossible : ${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Supprimer le gabarit « ${name} » ?`)) return;
    await deleteTemplate(id);
    reload();
  }

  return (
    <div className="dots-page">
      <div className="dots-page-header">
        <div>
          <h1>Gabarits</h1>
          <p>Un gabarit Typst fixe l'apparence du PDF : marges, en-tête, police, pagination.</p>
        </div>
        <div className="dots-actions">
          <ViewSwitcher view={view} onChange={handleViewChange} />
          <button type="button" className="dots-btn" onClick={() => setImportOpen(true)}>
            Importer un .typ
          </button>
          <button
            type="button"
            className="dots-btn dots-btn--brand"
            disabled={creating}
            onClick={handleCreate}
          >
            {creating ? "Création…" : "Nouveau gabarit"}
          </button>
        </div>
      </div>

      {error && (
        <div className="dots-notice dots-notice--error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="page-loading" role="status">
          Chargement…
        </div>
      ) : (
        <TemplateBrowser
          templates={templates}
          view={view}
          // La tuile ouvre l'éditeur de mise en page (cible produit) ; le code Typst
          // reste accessible par l'action secondaire.
          getOpenHref={(id) => `/t/${id}/layout`}
          renderBadge={(t) =>
            t.isDefault ? (
              <span className="dots-badge template-badge">
                <IconStar filled size={14} />
                Par défaut
              </span>
            ) : null
          }
          renderActions={(t) => (
            <span className="template-actions">
              <Link to={`/t/${t.id}`}>Code Typst</Link>
              <Link to={`/docs?template=${t.id}`}>Utiliser</Link>
              {!t.isDefault && (
                <button type="button" className="link-button" onClick={() => handleSetDefault(t.id)}>
                  Définir par défaut
                </button>
              )}
              <button
                type="button"
                className="link-button link-button--danger"
                aria-label={`Supprimer le gabarit ${t.name}`}
                onClick={() => handleDelete(t.id, t.name)}
              >
                Supprimer
              </button>
            </span>
          )}
        />
      )}

      <p className="dots-muted templates-note">
        <IconStar size={14} />
        Le gabarit par défaut s'applique à tout document ouvert tant qu'un autre n'est pas choisi.
      </p>

      {importOpen && <ImportTemplateModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
