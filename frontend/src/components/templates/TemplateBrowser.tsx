import { TemplateGridView } from "./TemplateGridView";
import { TemplateListView } from "./TemplateListView";
import type { TemplateViewProps } from "./types";
import type { TemplateView } from "./ViewSwitcher";

export type { TemplateView } from "./ViewSwitcher";

export interface TemplateBrowserProps extends TemplateViewProps {
  view: TemplateView;
}

export function TemplateBrowser({ view, ...rest }: TemplateBrowserProps) {
  return view === "grid" ? <TemplateGridView {...rest} /> : <TemplateListView {...rest} />;
}
