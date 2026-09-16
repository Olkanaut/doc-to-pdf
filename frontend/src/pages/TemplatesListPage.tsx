import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Badge, Button, VariantType, type ButtonProps } from "@gouvfr-lasuite/ui-components";
import { Code, Play, Plus, Star, StarFilled, Trash, Upload } from "@gouvfr-lasuite/ui-components/icons";
import {
  createTemplate,
  deleteTemplate,
  fetchDefaultTemplate,
  fetchTemplates,
  setDefaultTemplate,
  type TemplateSummary,
} from "../api/client";
import { ImportDocumentModal } from "../components/templates/ImportDocumentModal";
import { TemplateBrowser } from "../components/templates/TemplateBrowser";
import { ViewSwitcher, type TemplateView } from "../components/templates/ViewSwitcher";
import "../components/templates/templates-page.css";

const VIEW_STORAGE_KEY = "doc-pdf:templates-view";

function loadStoredView(): TemplateView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** `Button` du kit rendu en lien (`href`), navigation interne sans rechargement. */
function LinkButton({ to, onClick, ...props }: ButtonProps & { to: string }) {
  const navigate = useNavigate();
  return (
    <Button
      {...props}
      href={to}
      onClick={(e: MouseEvent<HTMLAnchorElement & HTMLButtonElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}

/**
 * Galerie des gabarits, page d'accueil de l'app. Deux actions en tête :
 * importer un document (un .typ s'ouvre tel quel, un PDF ou un .docx passe par
 * l'analyse et le recadrage) et partir de zéro.
 */
export function TemplatesListPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TemplateView>(loadStoredView);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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

  async function handleSetDefault(id: string) {
    setError(null);
    try {
      await setDefaultTemplate(id);
      reload();
    } catch (e) {
      setError(`Impossible de définir le gabarit par défaut : ${(e as Error).message}`);
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
          {/* Entrée unique : le type du fichier déposé choisit la suite. */}
          <Button
            variant="secondary"
            icon={<Upload aria-hidden="true" />}
            onClick={() => setImportOpen(true)}
          >
            Importer un document
          </Button>
          <Button
            color="brand"
            icon={<Plus aria-hidden="true" />}
            disabled={creating}
            onClick={() => void handleCreate()}
          >
            Nouveau gabarit
          </Button>
          <ViewSwitcher view={view} onChange={handleViewChange} />
        </div>
      </div>

      {importOpen && (
        <ImportDocumentModal
          onClose={() => {
            setImportOpen(false);
            reload();
          }}
          onTemplate={(id) => navigate(`/t/${id}/layout`)}
        />
      )}


      {error && (
        <div role="alert">
          <Alert type={VariantType.ERROR}>{error}</Alert>
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
              <Badge type="accent" className="template-badge">
                <StarFilled size={12} aria-hidden="true" />
                Par défaut
              </Badge>
            ) : null
          }
          // Chaque nom accessible porte le nom du gabarit : quatre actions par tuile,
          // un lecteur d'écran ne doit pas entendre quatre « Supprimer » identiques.
          // En grille (tuile ~176 px), les quatre actions sont des icônes seules
          // (nom accessible + title) pour tenir sur une ligne ; en liste, le texte reste.
          renderActions={(t) => (
            <span className="template-actions">
              <LinkButton
                to={`/t/${t.id}`}
                size="small"
                variant="tertiary"
                icon={<Code aria-hidden="true" />}
                aria-label={`Code Typst du gabarit ${t.name}`}
                title={view === "grid" ? "Code Typst" : undefined}
              >
                {view === "grid" ? undefined : "Code Typst"}
              </LinkButton>
              <LinkButton
                to={`/documents/new?template=${t.id}`}
                size="small"
                variant="tertiary"
                icon={<Play aria-hidden="true" />}
                aria-label={`Utiliser le gabarit ${t.name}`}
                title={view === "grid" ? "Utiliser" : undefined}
              >
                {view === "grid" ? undefined : "Utiliser"}
              </LinkButton>
              {!t.isDefault && (
                <Button
                  type="button"
                  size="small"
                  variant="tertiary"
                  color="neutral"
                  icon={<Star aria-hidden="true" />}
                  aria-label={`Définir par défaut le gabarit ${t.name}`}
                  title="Définir par défaut"
                  onClick={() => handleSetDefault(t.id)}
                />
              )}
              <Button
                type="button"
                size="small"
                variant="tertiary"
                color="error"
                icon={<Trash aria-hidden="true" />}
                aria-label={`Supprimer le gabarit ${t.name}`}
                title="Supprimer"
                onClick={() => handleDelete(t.id, t.name)}
              />
            </span>
          )}
        />
      )}

      <p className="dots-muted templates-note">
        <Star size={14} aria-hidden="true" />
        Le gabarit par défaut s'applique à tout document ouvert tant qu'un autre n'est pas choisi.
      </p>
    </div>
  );
}
