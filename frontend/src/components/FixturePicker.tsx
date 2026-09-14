import type { FixtureSummary } from "../api/client";

interface Props {
  fixtures: FixtureSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function FixturePicker({ fixtures, selectedId, onSelect }: Props) {
  return (
    <label className="field">
      <span>Document (mock)</span>
      <select value={selectedId} onChange={(e) => onSelect(e.target.value)}>
        {fixtures.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}
