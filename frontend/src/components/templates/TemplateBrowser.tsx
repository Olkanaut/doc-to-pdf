import { useState, type ReactNode } from "react";
import type { TemplateSummary } from "../../api/client";
import { OpenTarget } from "./OpenTarget";
import type { TemplateViewProps } from "./types";
import type { TemplateView } from "./ViewSwitcher";

export type { TemplateView } from "./ViewSwitcher";

export interface TemplateBrowserProps extends TemplateViewProps {
  view: TemplateView;
  /** Marque facultative (ex. « Par défaut »), rendue entre le titre et les actions. */
  renderBadge?: (template: TemplateSummary) => ReactNode;
}

/**
 * Single component for both the grid and list layouts. They share the same
 * data/props and almost the same structure (a `<ul>` of `<li>`s, one
 * "create new" entry, one open-target + optional actions per item) — the
 * only real content difference is the thumbnail (grid) vs. the description
 * text (list), rendered conditionally below. CSS class names stay
 * grid-/row-prefixed per mode so the existing styling needs no changes.
 */
export function TemplateBrowser({
  templates,
  view,
  getOpenHref,
  onOpen,
  renderBadge,
  renderActions,
  onCreateNew,
  createNewLabel = "Nouvelle template",
  emptyLabel = "Aucune template pour le moment.",
}: TemplateBrowserProps) {
  const isGrid = view === "grid";

  return (
    <ul className={isGrid ? "template-grid" : "template-rows"}>
      {onCreateNew && (
        <li
          className={
            isGrid ? "template-tile template-tile-new" : "template-row"
          }
        >
          <button
            type="button"
            className={isGrid ? "template-tile-new-btn" : "template-row-new"}
            onClick={onCreateNew}
          >
            {isGrid ? (
              <>
                <span className="template-tile-new-sheet" aria-hidden="true">
                  <span className="template-tile-plus">+</span>
                </span>
                <span className="template-tile-title">{createNewLabel}</span>
              </>
            ) : (
              <>
                <span className="template-tile-plus" aria-hidden="true">
                  +
                </span>
                <span>{createNewLabel}</span>
              </>
            )}
          </button>
        </li>
      )}

      {templates.length === 0 && !onCreateNew && (
        <li className="template-empty">{emptyLabel}</li>
      )}

      {templates.map((t) => (
        <li key={t.id} className={isGrid ? "template-tile" : "template-row"}>
          {isGrid ? (
            <>
              <OpenTarget
                id={t.id}
                href={getOpenHref?.(t.id)}
                onOpen={onOpen}
                className="template-tile-open"
              >
                <ThumbnailImage template={t} />
              </OpenTarget>
              <div className="template-tile-meta">
                <OpenTarget
                  id={t.id}
                  href={getOpenHref?.(t.id)}
                  onOpen={onOpen}
                  className="template-tile-title-link"
                >
                  <span className="template-tile-title">{t.name}</span>
                </OpenTarget>
                {renderActions && (
                  <div className="template-tile-actions">
                    {renderActions(t)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <OpenTarget
              id={t.id}
              href={getOpenHref?.(t.id)}
              onOpen={onOpen}
              className="template-row-open"
            >
              <span className="template-row-title">{t.name}</span>
              <span className="template-row-description">
                {t.description || "Sans description"}
              </span>
            </OpenTarget>
          )}
          {!isGrid && renderBadge?.(t)}
          {!isGrid && renderActions && (
            <div
              className={
                isGrid ? "template-tile-actions" : "template-row-actions"
              }
            >
              {renderActions(t)}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ThumbnailImage({ template }: { template: TemplateSummary }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="template-tile-thumb template-tile-thumb-fallback"
        aria-hidden="true"
      >
        {template.name.slice(0, 1)}
      </span>
    );
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
