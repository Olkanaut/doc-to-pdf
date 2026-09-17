import { useEffect, useId, useRef, useState } from "react";
import type { TemplateSummary } from "../../api/client";

interface TemplateActionsMenuProps {
  template: TemplateSummary;
  disabled?: boolean;
  onShare: (template: TemplateSummary) => void;
  onDelete: (template: TemplateSummary) => void;
  onUseAsDefault: (template: TemplateSummary) => void;
}

export function TemplateActionsMenu({
  template,
  disabled = false,
  onShare,
  onDelete,
  onUseAsDefault,
}: TemplateActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function run(action: (template: TemplateSummary) => void) {
    setOpen(false);
    action(template);
  }

  return (
    <div className="template-actions-menu" ref={rootRef}>
      <button
        type="button"
        className="template-actions-menu__trigger"
        aria-label={`Actions de la template ${template.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="template-actions-menu__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && (
        <div className="template-actions-menu__content" id={menuId} role="menu">
          <button type="button" role="menuitem" onClick={() => run(onShare)}>
            Share
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={template.isDefault}
            onClick={() => run(onUseAsDefault)}
          >
            Use as default
          </button>
          <button
            type="button"
            role="menuitem"
            className="template-actions-menu__danger"
            onClick={() => run(onDelete)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
