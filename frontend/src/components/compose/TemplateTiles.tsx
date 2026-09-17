import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Radio, RadioGroup } from "@gouvfr-lasuite/ui-components";
import type { TemplateSummary } from "../../api/client";

interface Props {
  templates: TemplateSummary[];
  selectedId: string;
  /** Template par défaut d'après /api/templates/default, si la liste ne porte pas isDefault. */
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
        <img
          src={`/api/templates/${template.id}/thumbnail?v=${encodeURIComponent(template.updatedAt)}`}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/**
 * Tuiles radio (Radio/RadioGroup du kit) : la miniature, le nom et le badge « Par défaut ».
 * Le fieldset reste : RadioGroup ne pose ni rôle de groupe ni légende.
 */
export function TemplateTiles({
  templates,
  selectedId,
  defaultId,
  onSelect,
}: Props) {
  return (
    <fieldset className="compose-templates">
      <legend>
        <span>Template</span>
        <Link to="/">Gérer</Link>
      </legend>
      <RadioGroup fullWidth>
        {templates.map((t) => (
          <Radio
            key={t.id}
            name="template"
            value={t.id}
            fullWidth
            className="compose-tile"
            checked={t.id === selectedId}
            onChange={() => onSelect(t.id)}
            label={
              <>
                <Thumb template={t} />
                <span className="compose-tile__name">{t.name}</span>
                {(t.isDefault || t.id === defaultId) && (
                  <Badge type="accent">Par défaut</Badge>
                )}
              </>
            }
          />
        ))}
      </RadioGroup>
    </fieldset>
  );
}
