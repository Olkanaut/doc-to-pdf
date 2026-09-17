import { type MouseEvent } from "react";
import { SegmentedIconSwitch } from "../SegmentedIconSwitch";
import { CodeModeIcon, EditModeIcon } from "./EditorModeIcons";

export type EditorMode = "layout" | "code";

interface EditorModeMenuProps {
  mode: EditorMode;
  layoutHref: string;
  codeHref: string;
  onNavigateLayout: (e: MouseEvent<HTMLElement>) => void;
  onNavigateCode: (e: MouseEvent<HTMLElement>) => void;
}

export function EditorModeMenu({
  mode,
  layoutHref,
  codeHref,
  onNavigateLayout,
  onNavigateCode,
}: EditorModeMenuProps) {
  return (
    <SegmentedIconSwitch
      ariaLabel="Mode d'édition"
      value={mode}
      items={[
        {
          value: "layout",
          href: layoutHref,
          label: "Mode mise en page",
          icon: <EditModeIcon aria-hidden="true" />,
          onClick: onNavigateLayout,
        },
        {
          value: "code",
          href: codeHref,
          label: "Mode code Typst",
          icon: <CodeModeIcon aria-hidden="true" />,
          onClick: onNavigateCode,
        },
      ]}
    />
  );
}
