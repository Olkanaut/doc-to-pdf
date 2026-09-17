import { type ReactNode, useEffect, useId } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelCallbackRef,
} from "react-resizable-panels";
import type { EditorMode } from "./EditorModeMenu";

const LAYOUT_PANEL_MAX_PX = 520;
const PANEL_TRANSITION = "flex 180ms ease";

interface LayoutEditorShellProps {
  mode: EditorMode;
  left: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  rightOpen?: boolean;
}

export function LayoutEditorShell({
  mode,
  left,
  center,
  right,
  rightOpen = false,
}: LayoutEditorShellProps) {
  const [rightPanelHandle, setRightPanelHandle] = usePanelCallbackRef();
  const layout = useDefaultLayout({
    id: "layout-editor-panels",
    onlySaveAfterUserInteractions: true,
    panelIds: ["left", "center", "right"],
  });

  useEffect(() => {
    if (rightOpen) {
      rightPanelHandle?.expand();
    } else {
      rightPanelHandle?.collapse();
    }
  }, [rightOpen, rightPanelHandle]);

  return (
    <Group
      id="layout-editor-panels"
      orientation="horizontal"
      className={`le-body le-body--${mode}${rightOpen ? " le-body--right" : ""}`}
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <Panel
        id="left"
        defaultSize="320px"
        minSize="260px"
        maxSize={`${LAYOUT_PANEL_MAX_PX}px`}
        className="le-shell__panel le-shell__panel--left"
        style={{
          transition: PANEL_TRANSITION,
        }}
      >
        {left}
      </Panel>

      <ResizeHandle label="Redimensionner le panneau d'édition" />

      <Panel
        id="center"
        minSize="360px"
        className="le-shell__panel le-shell__panel--center"
        style={{
          transition: PANEL_TRANSITION,
        }}
      >
        {center}
      </Panel>

      {rightOpen && <ResizeHandle label="Redimensionner l'assistant" />}
      <Panel
        panelRef={setRightPanelHandle}
        id="right"
        collapsible
        collapsedSize={0}
        defaultSize="380px"
        minSize="300px"
        maxSize="560px"
        className="le-shell__panel le-shell__panel--right"
        style={{
          transition: PANEL_TRANSITION,
        }}
      >
        {right}
      </Panel>
    </Group>
  );
}

function ResizeHandle({ label }: { label: string }) {
  return (
    <Separator
      id={useId()}
      className="le-resize-handle"
      aria-label={label}
    >
      <span className="le-resize-handle__line" aria-hidden="true" />
    </Separator>
  );
}
