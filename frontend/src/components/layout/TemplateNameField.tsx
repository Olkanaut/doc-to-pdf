import { Input } from "@gouvfr-lasuite/ui-components";

interface TemplateNameFieldProps {
  value: string;
  isDefault?: boolean;
  onChange: (value: string) => void;
}

export function TemplateNameField({
  value,
  isDefault,
  onChange,
}: TemplateNameFieldProps) {
  return (
    <div className="le-template-name">
      <Input
        label="Nom de la template"
        hideLabel
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {isDefault && <span className="le-panel__badge">Par défaut</span>}
    </div>
  );
}
