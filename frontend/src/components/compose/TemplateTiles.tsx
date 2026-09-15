import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import type { TemplateSummary } from "../../api/client";

interface Props {
  templates: TemplateSummary[];
  selectedId: string;
  /** Gabarit par défaut d'après /api/templates/default, si la liste ne porte pas isDefault. */
  defaultId: string | null;
  onSelect: (id: string) => void;
}

function Thumb({ template }: { template: TemplateSummary }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="compose-tile__thumb" aria-hidden="true">
      {failed ? (
        template.name.charAt(0).toUpperCase()
      ) : (
        <img src={`/api/templates/${template.id}/thumbnail?v=${encodeURIComponent(template.updatedAt)}`} alt="" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

/** Tuiles radio : la miniature, le nom et le badge « Par défaut ». */
export function TemplateTiles({ templates, selectedId, defaultId, onSelect }: Props) {
  return (
    <fieldset className="compose-templates">
      <legend>
        <span>Gabarit</span>
        <Link to="/templates">Gérer</Link>
      </legend>
      {templates.map((t) => (
        <Fragment key={t.id}>
          <input
            type="radio"
            name="template"
            id={`compose-tpl-${t.id}`}
            className="compose-tile__input"
            value={t.id}
            checked={t.id === selectedId}
            onChange={() => onSelect(t.id)}
          />
          <label htmlFor={`compose-tpl-${t.id}`} className="compose-tile">
            <Thumb template={t} />
            <span className="compose-tile__name">{t.name}</span>
            {(t.isDefault || t.id === defaultId) && <span className="dots-badge">Par défaut</span>}
          </label>
        </Fragment>
      ))}
    </fieldset>
  );
}
