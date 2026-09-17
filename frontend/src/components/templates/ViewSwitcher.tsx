import { Button } from "@gouvfr-lasuite/ui-components";
import { GridIcon, ListIcon } from "./icons";

export type TemplateView = "grid" | "list";

interface ViewSwitcherProps {
  view: TemplateView;
  onChange: (view: TemplateView) => void;
}

/** Same look as `.editor-modes` (pill + kit buttons) to stay in the same
 * color family as the actions to its left. */
export function ViewSwitcher({ view, onChange }: ViewSwitcherProps) {
  return (
    <div className="view-switcher" role="group" aria-label="Mode d'affichage des gabarits">
      <Button
        type="button"
        variant={view === "grid" ? "secondary" : "tertiary"}
        color="neutral"
        size="small"
        aria-pressed={view === "grid"}
        aria-label="Vue en grille avec vignettes"
        icon={<GridIcon />}
        onClick={() => onChange("grid")}
      />
      <Button
        type="button"
        variant={view === "list" ? "secondary" : "tertiary"}
        color="neutral"
        size="small"
        aria-pressed={view === "list"}
        aria-label="Vue en liste"
        icon={<ListIcon />}
        onClick={() => onChange("list")}
      />
    </div>
  );
}
