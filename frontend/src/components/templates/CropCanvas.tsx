import { useCallback, useEffect, useRef, useState } from "react";
import type { IngestRect } from "../../api/client";

/**
 * Rendu de la première page, avec un rectangle de sélection déplaçable et
 * redimensionnable. Les coordonnées de la sélection sont en points, dans le
 * repère de la page PDF ; l'affichage n'est qu'une mise à l'échelle, ce qui
 * évite d'avoir à convertir des pixels côté serveur.
 *
 * Glisser sur le fond trace une nouvelle zone : c'est ce geste qui fait passer
 * la sélection en « zone personnalisée » (voir onCustom).
 */

type Handle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

const HANDLES: Handle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
/** Position d'une poignée dans le rectangle, en fraction. */
const HANDLE_POS: Record<Handle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  w: [0, 0.5],
  e: [1, 0.5],
  sw: [0, 1],
  s: [0.5, 1],
  se: [1, 1],
};
const CURSOR: Record<Handle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  w: "ew-resize",
  e: "ew-resize",
  sw: "nesw-resize",
  s: "ns-resize",
  se: "nwse-resize",
};
/** En deçà, la sélection n'est plus découpable. */
const MIN_PT = 8;

interface Props {
  previewUrl: string;
  pageWidthPt: number;
  pageHeightPt: number;
  value: IngestRect;
  onChange: (rect: IngestRect) => void;
  /** Appelé au premier geste manuel : la zone ne vient plus d'une proposition. */
  onCustom: () => void;
}

interface Drag {
  mode: "move" | "draw" | Handle;
  /** Point de départ, en points page. */
  originX: number;
  originY: number;
  start: IngestRect;
}

export function CropCanvas({
  previewUrl,
  pageWidthPt,
  pageHeightPt,
  value,
  onChange,
  onCustom,
}: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Position d'un événement souris, en points page. */
  const toPage = useCallback(
    (event: PointerEvent | React.PointerEvent): { x: number; y: number } => {
      const box = surface.current?.getBoundingClientRect();
      if (!box || box.width === 0) return { x: 0, y: 0 };
      return {
        x: ((event.clientX - box.left) / box.width) * pageWidthPt,
        y: ((event.clientY - box.top) / box.height) * pageHeightPt,
      };
    },
    [pageWidthPt, pageHeightPt],
  );

  useEffect(() => {
    if (!dragging) return;

    function move(event: PointerEvent) {
      const state = drag.current;
      if (!state) return;
      const point = toPage(event);
      const dx = point.x - state.originX;
      const dy = point.y - state.originY;
      onChange(next(state, dx, dy, point, pageWidthPt, pageHeightPt));
    }
    function stop() {
      drag.current = null;
      setDragging(false);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging, onChange, pageWidthPt, pageHeightPt, toPage]);

  function begin(mode: Drag["mode"], event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const point = toPage(event);
    drag.current = {
      mode,
      originX: point.x,
      originY: point.y,
      start: mode === "draw" ? { x: point.x, y: point.y, width: 0, height: 0 } : value,
    };
    setDragging(true);
    onCustom();
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const style = {
    left: pct(value.x, pageWidthPt),
    top: pct(value.y, pageHeightPt),
    width: pct(value.width, pageWidthPt),
    height: pct(value.height, pageHeightPt),
  };

  return (
    <div
      ref={surface}
      className="crop"
      style={{ aspectRatio: `${pageWidthPt} / ${pageHeightPt}` }}
      onPointerDown={(event) => begin("draw", event)}
    >
      <img className="crop__page" src={previewUrl} alt="Première page du document importé" draggable={false} />

      {/* Voile en quatre bandes : la sélection reste à pleine clarté. */}
      <div className="crop__veil" style={{ left: 0, top: 0, right: 0, height: style.top }} />
      <div className="crop__veil" style={{ left: 0, top: `calc(${style.top} + ${style.height})`, right: 0, bottom: 0 }} />
      <div className="crop__veil" style={{ left: 0, top: style.top, width: style.left, height: style.height }} />
      <div
        className="crop__veil"
        style={{ left: `calc(${style.left} + ${style.width})`, top: style.top, right: 0, height: style.height }}
      />

      <div
        className="crop__rect"
        style={style}
        onPointerDown={(event) => begin("move", event)}
        role="presentation"
      >
        <span className="crop__size">
          {value.width.toFixed(1).replace(".", ",")} × {value.height.toFixed(1).replace(".", ",")} pt
        </span>
      </div>

      {HANDLES.map((handle) => {
        const [fx, fy] = HANDLE_POS[handle];
        return (
          <span
            key={handle}
            className="crop__handle"
            style={{
              left: `calc(${pct(value.x + value.width * fx, pageWidthPt)} - 5px)`,
              top: `calc(${pct(value.y + value.height * fy, pageHeightPt)} - 5px)`,
              cursor: CURSOR[handle],
            }}
            onPointerDown={(event) => begin(handle, event)}
          />
        );
      })}
    </div>
  );
}

/** Nouveau rectangle après un déplacement de (dx, dy), borné à la page. */
function next(
  state: Drag,
  dx: number,
  dy: number,
  point: { x: number; y: number },
  pageWidth: number,
  pageHeight: number,
): IngestRect {
  const s = state.start;

  if (state.mode === "draw") {
    const x = Math.min(state.originX, point.x);
    const y = Math.min(state.originY, point.y);
    return clamp(
      { x, y, width: Math.abs(point.x - state.originX), height: Math.abs(point.y - state.originY) },
      pageWidth,
      pageHeight,
    );
  }

  if (state.mode === "move") {
    // Un déplacement garde la taille : on borne la position, pas les côtés.
    const x = Math.min(Math.max(0, s.x + dx), pageWidth - s.width);
    const y = Math.min(Math.max(0, s.y + dy), pageHeight - s.height);
    return { x, y, width: s.width, height: s.height };
  }

  const handle = state.mode;
  let { x, y, width, height } = s;
  if (handle.includes("w")) {
    const right = s.x + s.width;
    x = Math.min(Math.max(0, s.x + dx), right - MIN_PT);
    width = right - x;
  }
  if (handle.includes("e")) {
    width = Math.max(MIN_PT, Math.min(s.width + dx, pageWidth - s.x));
  }
  if (handle.includes("n")) {
    const bottom = s.y + s.height;
    y = Math.min(Math.max(0, s.y + dy), bottom - MIN_PT);
    height = bottom - y;
  }
  if (handle.includes("s")) {
    height = Math.max(MIN_PT, Math.min(s.height + dy, pageHeight - s.y));
  }
  return clamp({ x, y, width, height }, pageWidth, pageHeight);
}

function clamp(rect: IngestRect, pageWidth: number, pageHeight: number): IngestRect {
  const x = Math.min(Math.max(0, rect.x), pageWidth - MIN_PT);
  const y = Math.min(Math.max(0, rect.y), pageHeight - MIN_PT);
  return {
    x,
    y,
    width: Math.max(MIN_PT, Math.min(rect.width, pageWidth - x)),
    height: Math.max(MIN_PT, Math.min(rect.height, pageHeight - y)),
  };
}
