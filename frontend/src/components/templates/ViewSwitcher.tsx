import { SegmentedIconSwitch } from "../SegmentedIconSwitch";
import { GridIcon, ListIcon } from "./icons";

export type TemplateView = "grid" | "list";

interface ViewSwitcherProps {
  view: TemplateView;
  onChange: (view: TemplateView) => void;
}

export function ViewSwitcher({ view, onChange }: ViewSwitcherProps) {
  return (
    <SegmentedIconSwitch
      ariaLabel="Mode d'affichage des templates"
      value={view}
      items={[
        {
          value: "grid",
          label: "Vue en grille avec vignettes",
          icon: <GridIcon />,
          onClick: () => onChange("grid"),
        },
        {
          value: "list",
          label: "Vue en liste",
          icon: <ListIcon />,
          onClick: () => onChange("list"),
        },
      ]}
    />
  );
}
