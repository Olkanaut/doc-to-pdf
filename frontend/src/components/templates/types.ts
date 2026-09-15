import type { ReactNode } from "react";
import type { TemplateSummary } from "../../api/client";

export interface TemplateViewProps {
  templates: TemplateSummary[];
  /** Real navigation: primary action renders as a Link to this href. */
  getOpenHref?: (id: string) => string;
  /** Inline-picker mode: primary action calls this instead. Ignored if getOpenHref is set. */
  onOpen?: (id: string) => void;
  /** Per-item secondary actions (e.g. "Utiliser" / "Supprimer"). Omit for a bare read-only picker. */
  renderActions?: (template: TemplateSummary) => ReactNode;
  /** Omit entirely to hide the "create new" entry (e.g. a read-only picker embedded elsewhere). */
  onCreateNew?: () => void;
  createNewLabel?: string;
  emptyLabel?: string;
}
