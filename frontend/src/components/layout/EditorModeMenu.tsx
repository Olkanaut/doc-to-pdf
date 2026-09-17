import { type MouseEvent } from "react";
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
    <nav className="le-mode-switcher" aria-label="Mode d'édition">
      <a
        href={layoutHref}
        className={`le-mode-switcher__item${mode === "layout" ? " le-mode-switcher__item--active" : ""}`}
        aria-current={mode === "layout" ? "page" : undefined}
        aria-label="Mode mise en page"
        title="Mise en page"
        onClick={onNavigateLayout}
      >
        <EditModeIcon aria-hidden="true" />
      </a>
      <a
        href={codeHref}
        className={`le-mode-switcher__item${mode === "code" ? " le-mode-switcher__item--active" : ""}`}
        aria-current={mode === "code" ? "page" : undefined}
        aria-label="Mode code Typst"
        title="Code Typst"
        onClick={onNavigateCode}
      >
        <CodeModeIcon aria-hidden="true" />
      </a>
    </nav>
  );
}
