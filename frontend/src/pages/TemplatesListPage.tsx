import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Badge, Button, VariantType, type ButtonProps } from "@gouvfr-lasuite/ui-components";
import { Code, Play, Plus, Star, StarFilled, Trash } from "@gouvfr-lasuite/ui-components/icons";
import {
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

/** Kit `Button` rendered as a link (`href`), internal navigation without a reload. */
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
 * Templates gallery, the app's home page. A single entry point at the top,
 * « Nouveau gabarit », opens the import window: it offers the choice between
 * dropping a file (a .typ opens as-is, a PDF or .docx goes through analysis
 * and cropping) and continuing without an import.
 */
export function TemplatesListPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TemplateView>(loadStoredView);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  function reload() {
    setLoading(true);
    setError(null);
    // The default template comes either via `isDefault` in the list or via
    // /templates/default (null as long as the route is missing or none is set).
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

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Supprimer le gabarit « ${name} » ?`)) return;
    await deleteTemplate(id);
    reload();
  }

  return (
    <div className="dots-page">
      <div className="dots-page-header templates-header">
        <div>
          <h1>Gabarits</h1>
          <p>Un gabarit Typst fixe l'apparence du PDF : marges, en-tête, police, pagination</p>
        </div>
        <div className="dots-actions">
          {/* Single entry point: the window that opens offers the choice between
              dropping a file and continuing without an import. */}
          <Button color="brand" icon={<Plus aria-hidden="true" />} onClick={() => setImportOpen(true)}>
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
          // The tile opens the layout editor (the product's main target); the Typst
          // code stays reachable through the secondary action.
          getOpenHref={(id) => `/t/${id}/layout`}
          renderBadge={(t) =>
            t.isDefault ? (
              <Badge type="accent" className="template-badge">
                <StarFilled size={12} aria-hidden="true" />
                Par défaut
              </Badge>
            ) : null
          }
          // Each accessible name carries the template's name: four actions per tile,
          // a screen reader must not hear four identical « Supprimer ».
          // In grid view (~176 px tile), the four actions are icon-only
          // (accessible name + title) to fit on one line; in list view, the text stays.
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
