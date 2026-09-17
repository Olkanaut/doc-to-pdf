interface Props {
  source: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onChange: (source: string) => void;
}

export function TemplateEditor({ source, enabled, onToggle, onChange }: Props) {
  return (
    <div className="template-editor">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>Éditer la template (.typ) avant de générer</span>
      </label>
      {enabled && (
        <textarea
          className="typ-textarea"
          spellCheck={false}
          value={source}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
        />
      )}
    </div>
  );
}
