import { useMemo, useRef, type ReactNode, type UIEvent } from "react";
import { Alert, VariantType } from "@gouvfr-lasuite/ui-components";
import { TemplateNameField } from "./TemplateNameField";

interface TypstCodePanelProps {
  source: string;
  templateName: string;
  isDefault?: boolean;
  disabled?: boolean;
  modeMenu: ReactNode;
  onSourceChange: (source: string) => void;
  onTemplateNameChange: (name: string) => void;
}

export function TypstCodePanel({
  source,
  templateName,
  isDefault,
  disabled,
  modeMenu,
  onSourceChange,
  onTemplateNameChange,
}: TypstCodePanelProps) {
  const gutterRef = useRef<HTMLPreElement>(null);
  const lineCount = Math.max(1, source.split("\n").length);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => String(i + 1)).join("\n"),
    [lineCount],
  );

  function syncGutterScroll(e: UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current)
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
  }

  return (
    <aside
      className="le-panel le-code-panel"
      aria-label="Code Typst de la template"
    >
      <div className="le-panel__top">
        <TemplateNameField
          value={templateName}
          isDefault={isDefault}
          onChange={onTemplateNameChange}
        />
        {modeMenu}
      </div>

      {disabled && (
        <Alert type={VariantType.WARNING} className="le-panel__notice">
          <span>
            Une proposition de l'assistant est en attente : appliquez-la ou
            ignorez-la avant de modifier le code.
          </span>
        </Alert>
      )}

      <div className="le-code-panel__editor" aria-label="Source Typst">
        <pre
          ref={gutterRef}
          className="le-code-panel__gutter"
          aria-hidden="true"
        >
          {lineNumbers}
        </pre>
        <textarea
          className="le-code-panel__textarea"
          aria-label="Source Typst"
          value={source}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => onSourceChange(e.target.value)}
          onScroll={syncGutterScroll}
        />
      </div>

      <div className="le-code-panel__footer">
        <span>Typst</span>
        <span>
          {lineCount} ligne{lineCount > 1 ? "s" : ""}
        </span>
      </div>
    </aside>
  );
}
