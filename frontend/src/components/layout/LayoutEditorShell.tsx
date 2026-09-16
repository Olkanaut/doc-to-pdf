import { type ReactNode, useEffect, useId } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelCallbackRef,
} from "react-resizable-panels";

interface LayoutEditorShellProps {
  leftPanel: ReactNode;
  preview: ReactNode;
  aiPanel: ReactNode;
  aiOpen: boolean;
}

export function LayoutEditorShell({
  leftPanel,
  preview,
  aiPanel,
  aiOpen,
}: LayoutEditorShellProps) {
  const [aiPanelHandle, setAiPanelHandle] = usePanelCallbackRef();
  const layout = useDefaultLayout({
    id: "layout-editor-panels",
    onlySaveAfterUserInteractions: true,
    panelIds: ["settings", "preview", "ai"],
  });

  useEffect(() => {
    if (aiOpen) {
      aiPanelHandle?.expand();
    } else {
      aiPanelHandle?.collapse();
    }
  }, [aiOpen, aiPanelHandle]);

  return (
    <Group
      id="layout-editor-panels"
      orientation="horizontal"
      className={`le-body${aiOpen ? " le-body--ai" : ""}`}
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <Panel
        id="settings"
        defaultSize="320px"
        minSize="260px"
        maxSize="520px"
        className="le-shell__panel le-shell__panel--settings"
      >
        {leftPanel}
      </Panel>

      <ResizeHandle label="Redimensionner les réglages" />

      <Panel
        id="preview"
        minSize="360px"
        className="le-shell__panel le-shell__panel--preview"
      >
        {preview}
      </Panel>

      {aiOpen && <ResizeHandle label="Redimensionner l'assistant" />}
      <Panel
        panelRef={setAiPanelHandle}
        id="ai"
        collapsible
        collapsedSize={0}
        defaultSize="380px"
        minSize="300px"
        maxSize="560px"
        className="le-shell__panel le-shell__panel--ai"
      >
        {aiPanel}
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
