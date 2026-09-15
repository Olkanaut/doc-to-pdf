import { OpenTarget } from "./OpenTarget";
import type { TemplateViewProps } from "./types";

export function TemplateListView({
  templates,
  getOpenHref,
  onOpen,
  renderActions,
  onCreateNew,
  createNewLabel = "Nouveau gabarit",
  emptyLabel = "Aucun gabarit pour le moment.",
}: TemplateViewProps) {
  return (
    <ul className="template-rows">
      {onCreateNew && (
        <li className="template-row">
          <button type="button" className="template-row-new" onClick={onCreateNew}>
            <span className="template-tile-plus" aria-hidden="true">
              +
            </span>
            <span>{createNewLabel}</span>
          </button>
        </li>
      )}

      {templates.length === 0 && !onCreateNew && <li className="template-empty">{emptyLabel}</li>}

      {templates.map((t) => (
        <li key={t.id} className="template-row">
          <OpenTarget id={t.id} href={getOpenHref?.(t.id)} onOpen={onOpen} className="template-row-open">
            <span className="template-row-title">{t.name}</span>
            <span className="template-row-description">{t.description || "Sans description"}</span>
          </OpenTarget>
          {renderActions && <div className="template-row-actions">{renderActions(t)}</div>}
        </li>
      ))}
    </ul>
  );
}
