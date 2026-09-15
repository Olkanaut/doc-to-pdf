import { GridIcon, ListIcon } from "./icons";

export type TemplateView = "grid" | "list";

interface ViewSwitcherProps {
  view: TemplateView;
  onChange: (view: TemplateView) => void;
}

export function ViewSwitcher({ view, onChange }: ViewSwitcherProps) {
  return (
    <div className="view-switcher" role="group" aria-label="Mode d'affichage des gabarits">
      <button
        type="button"
        className="view-switcher-btn"
        aria-pressed={view === "grid"}
        aria-label="Vue en grille avec vignettes"
        onClick={() => onChange("grid")}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        className="view-switcher-btn"
        aria-pressed={view === "list"}
        aria-label="Vue en liste"
        onClick={() => onChange("list")}
      >
        <ListIcon />
      </button>
    </div>
  );
}
