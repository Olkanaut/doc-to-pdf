import type { TemplateSummary } from "../api/client";

interface Props {
  templates: TemplateSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function TemplatePicker({ templates, selectedId, onSelect }: Props) {
  return (
    <label className="field">
      <span>Gabarit</span>
      <select value={selectedId} onChange={(e) => onSelect(e.target.value)}>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <p className="hint">{templates.find((t) => t.id === selectedId)?.description}</p>
    </label>
  );
}
