import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, VariantType } from "@gouvfr-lasuite/ui-components";
import { StarFilled } from "@gouvfr-lasuite/ui-components/icons";
import {
  deleteTemplate,
  fetchDefaultTemplate,
  fetchTemplates,
  setDefaultTemplate,
  type TemplateSummary,
} from "../api/client";
import { DocsUrlField } from "../components/compose/DocsUrlField";
import { ImportDocumentModal } from "../components/templates/ImportDocumentModal";
import { TemplateActionsMenu } from "../components/templates/TemplateActionsMenu";
import { TemplateBrowser } from "../components/templates/TemplateBrowser";
import {
  ViewSwitcher,
  type TemplateView,
} from "../components/templates/ViewSwitcher";
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
/**
 * Templates gallery, the app's home page. A single entry point at the top,
 * « Nouvelle template », opens the import window: it offers the choice between
 * dropping a file (a .typ opens as-is, a PDF or .docx goes through analysis
 * and cropping) and continuing without an import.
 */
export function TemplatesListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TemplateView>(loadStoredView);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const selectedTemplateId = searchParams.get("template");

  function reload() {
    setLoading(true);
    setError(null);
    // The default template comes either via `isDefault` in the list or via
    // /templates/default (null as long as the route is missing or none is set).
    Promise.all([fetchTemplates(), fetchDefaultTemplate().catch(() => null)])
      .then(([list, def]) =>
        setTemplates(
          list.map((t) => ({
            ...t,
            isDefault: t.isDefault ?? t.id === def?.id,
          })),
        ),
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

  function openDocument(documentId: string) {
    navigate(
      `/docs/${encodeURIComponent(documentId)}${
        selectedTemplateId
          ? `?template=${encodeURIComponent(selectedTemplateId)}`
          : ""
      }`,
    );
  }

  function handleShare() {
    // Placeholder until template sharing is backed by an API/product flow.
  }

  async function handleDelete(template: TemplateSummary) {
    if (!window.confirm(`Supprimer la template « ${template.name} » ?`)) return;
    setPendingActionId(template.id);
    setError(null);
    try {
      await deleteTemplate(template.id);
      reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Impossible de supprimer la template.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleUseAsDefault(template: TemplateSummary) {
    setPendingActionId(template.id);
    setError(null);
    try {
      await setDefaultTemplate(template.id);
      reload();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossible de définir la template par défaut.",
      );
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="dots-page templates-home">
      <section
        className="templates-home__hero"
        aria-label="Ouvrir un document Docs"
      >
        <HomeLogo />
        <div className="templates-home__url">
          <DocsUrlField
            onOpen={(id) => openDocument(id)}
            loading={false}
            error={null}
          />
        </div>
      </section>

      <div className="dots-page-header templates-header">
        <h1>Mes templates</h1>
        <div className="dots-actions">
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
          onCreateNew={() => setImportOpen(true)}
          createNewLabel="Nouvelle template"
          getOpenHref={(id) => `/t/${id}/layout`}
          renderBadge={(t) =>
            t.isDefault ? (
              <Badge type="accent" className="template-badge">
                <StarFilled size={12} aria-hidden="true" />
                Par défaut
              </Badge>
            ) : null
          }
          renderActions={(t) => (
            <TemplateActionsMenu
              template={t}
              disabled={pendingActionId === t.id}
              onShare={handleShare}
              onDelete={handleDelete}
              onUseAsDefault={handleUseAsDefault}
            />
          )}
        />
      )}
    </div>
  );
}

function HomeLogo() {
  return (
    <svg
      className="templates-home__logo"
      viewBox="0 0 2156 698"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dots"
    >
      <circle cx="197.978" cy="500.022" r="197.978" fill="#2945C1" />
      <circle cx="534.287" cy="95.1818" r="95.1818" fill="#2945C1" />
      <circle cx="534.287" cy="349" r="95.1818" fill="#BA2F4D" />
      <circle cx="534.287" cy="602.818" r="95.1818" fill="#BA2F4D" />
      <path
        d="M856 553.494H1021.2C1154.57 553.494 1244.68 456.78 1244.68 343.247C1244.68 229.714 1154.57 133 1021.2 133H856V553.494ZM1022.4 210.491C1100.5 210.491 1156.97 268.159 1156.97 343.247C1156.97 417.734 1100.5 476.003 1022.4 476.003H941.305V210.491H1022.4Z"
        fill="#2945C1"
      />
      <path
        d="M1462.75 238.724C1364.23 238.724 1296.94 311.41 1296.94 402.116C1296.94 492.823 1364.23 565.508 1462.75 565.508C1561.27 565.508 1628.55 492.823 1628.55 402.116C1628.55 311.41 1561.27 238.724 1462.75 238.724ZM1463.95 493.423C1413.49 493.423 1376.24 454.978 1376.24 402.116C1376.24 349.254 1413.49 310.809 1463.95 310.809C1512.61 310.809 1549.25 349.254 1549.25 402.116C1549.25 454.377 1512.61 493.423 1463.95 493.423Z"
        fill="#2945C1"
      />
      <path
        d="M1713.86 442.964C1713.86 516.851 1749.9 559.501 1825.59 559.501C1850.82 559.501 1868.85 556.497 1883.87 549.89V483.211C1873.65 487.416 1859.84 489.819 1838.81 489.819C1808.77 489.819 1790.75 476.604 1790.75 442.964V319.219H1883.26V250.738H1790.75V175.049H1713.86V250.738H1657.39V319.219H1713.86V442.964Z"
        fill="#2945C1"
      />
      <path
        d="M1925.32 509.642C1954.15 543.883 1992.6 565.508 2046.67 565.508C2103.74 565.508 2154.8 530.667 2156 466.992C2156 362.469 2011.22 380.491 2011.22 328.83C2011.22 313.212 2022.64 299.996 2046.67 299.996C2070.09 299.996 2089.92 315.614 2105.54 334.837L2156 290.385C2134.37 260.95 2092.32 238.724 2046.06 238.724C1982.99 238.724 1937.93 278.971 1937.93 332.434C1937.93 438.759 2082.71 418.936 2082.71 471.798C2082.71 489.819 2070.09 504.236 2045.46 504.236C2016.63 504.236 1994.4 487.416 1975.78 463.989L1925.32 509.642Z"
        fill="#2945C1"
      />
    </svg>
  );
}
