import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Loader, VariantType } from "@gouvfr-lasuite/ui-components";
import {
  type FieldCandidate,
  type IngestAnalysis,
  type RegistryFieldId,
  type TemplateAssetV2,
  type TemplateFieldV2,
  type TemplateModelV2,
  type TemplateNodeV2,
  type TemplateRegionKindV2,
  type TemplateScopeV2,
  type TypedFieldType,
} from "../../../api/client";

const REGION_LABELS: Record<TemplateRegionKindV2, string> = {
  header: "En-tête",
  footer: "Pied",
  body: "Corps",
  sidebar: "Colonne",
  watermark: "Filigrane",
  signature: "Signature",
  background: "Fond",
  custom: "Custom",
};

const SCOPE_LABELS: Record<TemplateScopeV2, string> = {
  all: "Toutes",
  first: "Première",
  "except-first": "Sauf première",
  odd: "Impaires",
  even: "Paires",
  last: "Dernière",
};

const FIELD_TYPES: readonly TypedFieldType[] = ["text", "date", "image", "address", "number", "richText"];
const REGIONS: readonly TemplateRegionKindV2[] = ["header", "body", "footer", "signature", "watermark", "custom"];
const SCOPES: readonly TemplateScopeV2[] = ["all", "first", "except-first", "odd", "even", "last"];

interface Props {
  analysis: IngestAnalysis;
  previewUrl: (pageIndex: number) => string;
  value: TemplateModelV2;
  onChange: (model: TemplateModelV2) => void;
  onRasterize: (rect: { x: number; y: number; width: number; height: number }, pageIndex: number) => Promise<string>;
  onPreview: () => Promise<void>;
  previewPdfUrl: string | null;
  previewLoading: boolean;
  previewError: string | null;
}

export function ImportVisualEditor({
  analysis,
  previewUrl,
  value,
  onChange,
  onRasterize,
  onPreview,
  previewPdfUrl,
  previewLoading,
  previewError,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pages = analysis.importModel.pages.length
    ? analysis.importModel.pages
    : [{ id: "page-1", pageIndex: 0, widthPt: analysis.page.widthPt, heightPt: analysis.page.heightPt, rotation: 0 as const }];
  const [activePageIndex, setActivePageIndex] = useState(pages[0]?.pageIndex ?? 0);
  const [customFieldId, setCustomFieldId] = useState("custom.field");
  const [rasterizing, setRasterizing] = useState(false);
  const page = pages.find((candidate) => candidate.pageIndex === activePageIndex) ?? pages[0]!;
  const pageNodes = useMemo(
    () => value.nodes.filter((node) => nodePageIndex(node) === page.pageIndex),
    [page.pageIndex, value.nodes],
  );
  const selected = pageNodes.filter((node) => selectedIds.includes(node.id));
  const primary = selected[0] ?? null;
  const shownNodes = pageNodes.filter((node) => !isHidden(node));
  const selectedCandidate = value.fieldCandidates[0] ?? null;

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => pageNodes.some((node) => node.id === id));
      return next.length === current.length ? current : next;
    });
  }, [activePageIndex, pageNodes]);

  const pageStyle = useMemo(
    () => ({
      aspectRatio: `${page.widthPt} / ${page.heightPt}`,
    }),
    [page.heightPt, page.widthPt],
  );

  function setModel(next: TemplateModelV2) {
    onChange(next);
  }

  function select(nodeId: string, additive: boolean) {
    setSelectedIds((current) =>
      additive
        ? current.includes(nodeId)
          ? current.filter((id) => id !== nodeId)
          : [...current, nodeId]
        : [nodeId],
    );
  }

  function patchNodes(ids: readonly string[], patch: Partial<TemplateNodeV2>) {
    setModel({
      ...value,
      nodes: value.nodes.map((node) =>
        ids.includes(node.id) ? ({ ...node, ...patch } as TemplateNodeV2) : node,
      ),
    });
  }

  function patchNodeStyle(ids: readonly string[], patch: Record<string, unknown>) {
    setModel({
      ...value,
      nodes: value.nodes.map((node) =>
        ids.includes(node.id)
          ? ({ ...node, style: { ...(node.style ?? {}), ...patch } } as TemplateNodeV2)
          : node,
      ),
    });
  }

  function deleteSelection() {
    setModel({ ...value, nodes: value.nodes.filter((node) => !selectedIds.includes(node.id)) });
    setSelectedIds([]);
  }

  function hideSelection() {
    patchNodeStyle(selectedIds, { hidden: true });
    setSelectedIds([]);
  }

  function groupSelection() {
    if (selected.length < 2) return;
    const box = unionBBox(selected);
    const group: TemplateNodeV2 = {
      id: `group-${Date.now()}`,
      type: "group",
      region: selected[0].region,
      regionId: selected[0].regionId,
      scope: selected[0].scope,
      pageIndex: activePageIndex,
      bbox: box ?? undefined,
      layout: box ? { mode: "absolute", x: box.x, y: box.y, width: box.width, height: box.height } : undefined,
      source: { kind: "user", objectIds: [], assetIds: [] },
      confidence: 1,
      locked: false,
      order: Math.max(...value.nodes.map((node) => node.order), 0) + 1,
      children: selectedIds,
      clipping: false,
    };
    setModel({ ...value, nodes: [...value.nodes, group] });
    setSelectedIds([group.id]);
  }

  function ungroupSelection() {
    const groups = selected.filter((node) => node.type === "group");
    if (!groups.length) return;
    setModel({
      ...value,
      nodes: value.nodes.filter((node) => !groups.some((group) => group.id === node.id)),
    });
    setSelectedIds(groups.flatMap((group) => group.type === "group" ? group.children : []));
  }

  function acceptCandidate(candidate: FieldCandidate): TemplateFieldV2 {
    const existing = value.fields.find((field) => field.id === candidate.fieldId);
    if (existing) return existing;
    const field: TemplateFieldV2 = {
      id: candidate.fieldId,
      label: candidate.label,
      type: candidate.type,
      required: candidate.required,
      defaultValue: candidate.defaultValue,
      format: candidate.format,
      source: {
        kind: candidate.sourceCandidate.kind === "metadata" || candidate.sourceCandidate.kind === "filename"
          ? "user"
          : candidate.sourceCandidate.kind,
        objectIds: candidate.sourceCandidate.objectIds,
        assetIds: candidate.sourceCandidate.assetIds,
      },
      sourceCandidate: candidate.sourceCandidate,
      confidence: candidate.confidence,
      aliases: [],
    };
    setModel({ ...value, fields: [...value.fields, field] });
    return field;
  }

  function ensureCustomField(): TemplateFieldV2 {
    const id = normalizeCustomFieldId(customFieldId);
    const existing = value.fields.find((field) => field.id === id);
    if (existing) return existing;
    const field: TemplateFieldV2 = {
      id,
      label: id.replace(/^custom\./, ""),
      type: "text",
      required: false,
      source: { kind: "user", objectIds: [], assetIds: [] },
      sourceCandidate: { kind: "user", objectIds: [], assetIds: [], confidence: 1 },
      confidence: 1,
      aliases: [],
    };
    setModel({ ...value, fields: [...value.fields, field] });
    return field;
  }

  function convertSelectionToField(field: TemplateFieldV2) {
    setModel({
      ...value,
      fields: value.fields.some((item) => item.id === field.id) ? value.fields : [...value.fields, field],
      nodes: value.nodes.map((node) => {
        if (!selectedIds.includes(node.id)) return node;
        return {
          ...node,
          type: "field",
          fieldId: field.id,
          fieldType: field.type,
          label: field.label,
          placeholder: field.label,
        } as TemplateNodeV2;
      }),
    });
  }

  function convertSelectionToText() {
    setModel({
      ...value,
      nodes: value.nodes.map((node) => {
        if (!selectedIds.includes(node.id) || node.type !== "field") return node;
        return {
          ...node,
          type: "text",
          text: node.label ?? node.fieldId,
        } as TemplateNodeV2;
      }),
    });
  }

  async function rasterizeSelection() {
    const box = unionBBox(selected);
    if (!box) return;
    setRasterizing(true);
    try {
      const file = await onRasterize(box, activePageIndex);
      const imageNode: TemplateNodeV2 = {
        id: `raster-${Date.now()}`,
        type: "image",
        region: primary?.region ?? "body",
        regionId: primary?.regionId ?? "region-body",
        pageIndex: activePageIndex,
        scope: primary?.scope ?? "all",
        bbox: box,
        layout: { mode: "absolute", x: box.x, y: box.y, width: box.width, height: box.height },
        style: { imageHeightMm: 0 },
        source: { kind: "user", objectIds: selectedIds, assetIds: [file] },
        confidence: 1,
        locked: false,
        order: Math.max(...value.nodes.map((node) => node.order), 0) + 1,
        imageKind: "raster-region",
        assetId: file,
      };
      const asset: TemplateAssetV2 = {
        id: file,
        file,
        name: file,
        source: { kind: "user", objectIds: selectedIds, assetIds: [file] },
      };
      setModel({
        ...value,
        assets: value.assets.some((item) => item.id === file) ? value.assets : [...value.assets, asset],
        nodes: [
          ...value.nodes.map((node) =>
            selectedIds.includes(node.id)
              ? ({ ...node, style: { ...(node.style ?? {}), hidden: true } } as TemplateNodeV2)
              : node,
          ),
          imageNode,
        ],
      });
      setSelectedIds([imageNode.id]);
    } finally {
      setRasterizing(false);
    }
  }

  return (
    <div className="import-editor">
      <div className="import-editor__toolbar" aria-label="Actions d'édition">
        {pages.length > 1 && (
          <div className="import-page-tabs" aria-label="Pages du document">
            {pages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`import-page-tab${item.pageIndex === activePageIndex ? " import-page-tab--on" : ""}`}
                aria-pressed={item.pageIndex === activePageIndex}
                onClick={() => setActivePageIndex(item.pageIndex)}
              >
                Page {item.pageIndex + 1}
              </button>
            ))}
          </div>
        )}
        <Button type="button" size="small" color="neutral" variant="secondary" disabled={selected.length < 2} onClick={groupSelection}>
          Grouper
        </Button>
        <Button type="button" size="small" color="neutral" variant="secondary" disabled={!selected.some((node) => node.type === "group")} onClick={ungroupSelection}>
          Dégrouper
        </Button>
        <Button type="button" size="small" color="neutral" variant="secondary" disabled={!selected.length || rasterizing} onClick={() => void rasterizeSelection()}>
          {rasterizing ? "Rasterisation…" : "Rasteriser"}
        </Button>
        <Button type="button" size="small" color="neutral" variant="tertiary" disabled={!selected.length} onClick={hideSelection}>
          Masquer
        </Button>
        <Button type="button" size="small" color="error" variant="tertiary" disabled={!selected.length} onClick={deleteSelection}>
          Supprimer
        </Button>
        <Button type="button" size="small" disabled={previewLoading} onClick={() => void onPreview()}>
          {previewLoading ? "Preview…" : "Preview Typst"}
        </Button>
      </div>

      <div className="import-editor__grid">
        <aside className="import-editor__layers" aria-label="Calques extraits">
          <div className="import-editor__panel-title">Calques</div>
          <div className="import-editor__layers-list">
            {pageNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`import-editor__layer${selectedIds.includes(node.id) ? " import-editor__layer--on" : ""}${isHidden(node) ? " import-editor__layer--hidden" : ""}`}
                onClick={(event) => select(node.id, event.shiftKey || event.metaKey)}
              >
                <span>{nodeLabel(node)}</span>
                <small>{REGION_LABELS[node.region]} · {SCOPE_LABELS[node.scope]}</small>
              </button>
            ))}
          </div>
        </aside>

        <div className="import-editor__page-wrap">
          <div className="import-editor__page" style={pageStyle} onClick={() => setSelectedIds([])}>
            <img className="import-editor__page-img" src={previewUrl(activePageIndex)} alt="" />
            <svg
              className="import-editor__overlay"
              viewBox={`0 0 ${page.widthPt} ${page.heightPt}`}
              role="img"
              aria-label="Objets extraits du document"
            >
              {shownNodes.map((node) => {
                const box = node.bbox ?? layoutBBox(node);
                if (!box) return null;
                return (
                  <g key={node.id} onClick={(event) => {
                    event.stopPropagation();
                    select(node.id, event.shiftKey || event.metaKey);
                  }}>
                    <rect
                      x={box.x}
                      y={box.y}
                      width={Math.max(box.width, 1)}
                      height={Math.max(box.height, 1)}
                      className={`import-editor__box import-editor__box--${node.type}${selectedIds.includes(node.id) ? " import-editor__box--on" : ""}`}
                    />
                    <text x={box.x + 3} y={Math.max(10, box.y + 11)} className="import-editor__box-label">
                      {nodeLabel(node)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <aside className="import-editor__props" aria-label="Propriétés">
          <div className="import-editor__panel-title">Propriétés</div>
          {!primary ? (
            <p className="import-editor__empty">Sélectionnez un objet extrait.</p>
          ) : (
            <div className="import-editor__form">
              <label>
                Région
                <select value={primary.region} onChange={(event) => patchNodes(selectedIds, { region: event.target.value as TemplateRegionKindV2 })}>
                  {REGIONS.map((region) => <option key={region} value={region}>{REGION_LABELS[region]}</option>)}
                </select>
              </label>

              <label>
                Répétition
                <select value={primary.scope} onChange={(event) => patchNodes(selectedIds, { scope: event.target.value as TemplateScopeV2 })}>
                  {SCOPES.map((scope) => <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>)}
                </select>
              </label>

              <label>
                Alignement
                <select value={String(primary.style?.align ?? "left")} onChange={(event) => patchNodeStyle(selectedIds, { align: event.target.value })}>
                  <option value="left">Gauche</option>
                  <option value="center">Centre</option>
                  <option value="right">Droite</option>
                </select>
              </label>

              <label>
                Taille texte
                <input
                  type="number"
                  min="6"
                  max="72"
                  value={Number(primary.style?.fontSize ?? 11)}
                  onChange={(event) => patchNodeStyle(selectedIds, { fontSize: Number(event.target.value) })}
                />
              </label>

              <label>
                Couleur
                <input
                  type="color"
                  value={typeof primary.style?.color === "string" ? primary.style.color : "#000000"}
                  onChange={(event) => patchNodeStyle(selectedIds, { color: event.target.value })}
                />
              </label>

              <div className="import-editor__field-box">
                <div className="import-editor__panel-title">Champs</div>
                {value.fieldCandidates.length > 0 && (
                  <label>
                    Candidat
                    <select
                      value={selectedCandidate?.id ?? ""}
                      onChange={(event) => {
                        const candidate = value.fieldCandidates.find((item) => item.id === event.target.value);
                        if (candidate) convertSelectionToField(acceptCandidate(candidate));
                      }}
                    >
                      {value.fieldCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.label} · {Math.round(candidate.confidence * 100)}%
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="import-editor__inline">
                  <input
                    type="text"
                    value={customFieldId}
                    onChange={(event) => setCustomFieldId(event.target.value)}
                    aria-label="Champ custom"
                  />
                  <Button type="button" size="small" color="neutral" variant="secondary" disabled={!selected.length} onClick={() => convertSelectionToField(ensureCustomField())}>
                    Convertir
                  </Button>
                </div>

                {primary.type === "field" && (
                  <Button type="button" size="small" color="neutral" variant="tertiary" onClick={convertSelectionToText}>
                    Repasser en texte fixe
                  </Button>
                )}
              </div>

              {primary.type === "field" && (
                <label>
                  Type du champ
                  <select value={primary.fieldType} onChange={(event) => patchNodes(selectedIds, { fieldType: event.target.value as TypedFieldType })}>
                    {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {previewLoading && (
            <div className="import-editor__preview-status">
              <Loader />
              <span>Compilation…</span>
            </div>
          )}
          {previewError && <Alert type={VariantType.ERROR}>{previewError}</Alert>}
          {previewPdfUrl && (
            <iframe className="import-editor__preview" title="Preview Typst" src={previewPdfUrl} />
          )}
        </aside>
      </div>
    </div>
  );
}

function nodeLabel(node: TemplateNodeV2): string {
  if (node.type === "text") return node.text.slice(0, 32) || "Texte";
  if (node.type === "field") return `Champ ${node.fieldId}`;
  if (node.type === "image") return node.assetId ?? "Image";
  if (node.type === "pageNumber") return "Pagination";
  return node.type;
}

function isHidden(node: TemplateNodeV2): boolean {
  return node.style?.hidden === true;
}

function nodePageIndex(node: TemplateNodeV2): number {
  return typeof node.pageIndex === "number" ? node.pageIndex : 0;
}

function layoutBBox(node: TemplateNodeV2) {
  if (!node.layout) return undefined;
  if (
    typeof node.layout.x !== "number" ||
    typeof node.layout.y !== "number" ||
    typeof node.layout.width !== "number" ||
    typeof node.layout.height !== "number"
  ) return undefined;
  return {
    x: node.layout.x,
    y: node.layout.y,
    width: node.layout.width,
    height: node.layout.height,
  };
}

function unionBBox(nodes: readonly TemplateNodeV2[]) {
  const boxes = nodes.map((node) => node.bbox ?? layoutBBox(node)).filter(Boolean) as Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function normalizeCustomFieldId(value: string): RegistryFieldId {
  const raw = value.trim().replace(/\s+/g, "_");
  return (/^custom\.[a-zA-Z0-9_-]+(?:[.:][a-zA-Z0-9_-]+)*$/.test(raw)
    ? raw
    : `custom.${raw.replace(/^custom\./, "").replace(/[^a-zA-Z0-9_.:-]/g, "_") || "field"}`) as RegistryFieldId;
}
