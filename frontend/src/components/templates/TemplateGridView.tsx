import { useState } from "react";
import type { TemplateSummary } from "../../api/client";
import { OpenTarget } from "./OpenTarget";
import type { TemplateViewProps } from "./types";

export function TemplateGridView({
  templates,
  getOpenHref,
  onOpen,
  renderActions,
  onCreateNew,
  createNewLabel = "Nouveau gabarit",
  emptyLabel = "Aucun gabarit pour le moment.",
}: TemplateViewProps) {
  return (
    <div className="template-grid">
      {onCreateNew && (
        <button type="button" className="template-tile template-tile-new" onClick={onCreateNew}>
          <span className="template-tile-plus" aria-hidden="true">
            +
          </span>
          <span>{createNewLabel}</span>
        </button>
      )}

      {templates.length === 0 && !onCreateNew && <p className="template-empty">{emptyLabel}</p>}

      {templates.map((t) => (
        <div key={t.id} className="template-tile">
          <OpenTarget id={t.id} href={getOpenHref?.(t.id)} onOpen={onOpen} className="template-tile-open">
            <ThumbnailImage template={t} />
            <span className="template-tile-title">{t.name}</span>
          </OpenTarget>
          {renderActions && <div className="template-tile-actions">{renderActions(t)}</div>}
        </div>
      ))}
    </div>
  );
}

function ThumbnailImage({ template }: { template: TemplateSummary }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="template-tile-thumb template-tile-thumb-fallback" aria-hidden="true">
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
