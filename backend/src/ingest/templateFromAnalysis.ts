/**
 * Analyse d'un PDF/DOCX → LayoutConfig, puis source .typ.
 *
 * Le relevé (format, marges, police, interligne, couleur) vient du script
 * Python ; ce qui se décide ici, c'est ce que le template en fait : un fragment
 * d'en-tête devient un bandeau bord à bord, et la marge correspondante est
 * élargie à la hauteur rendue de l'image — sinon Typst la rogne, sans rien
 * signaler.
 */
import {
  INLINE_LOGO_HEIGHT_MM,
  sanitizeLayout,
  type LayoutConfig,
} from "../layout/layoutConfig.js";
import { applyLayout } from "../layout/layoutTypst.js";
import type { Analysis, Fragment } from "./sidecar.js";

const PT_PER_MM = 72 / 25.4;
/** Un cheveu de marge en plus : une image au ras du bord se rogne à l'arrondi. */
const BLEED_SLACK_MM = 1;
/**
 * Part de la marge que Typst réserve entre l'en-tête et le corps
 * (`header-ascent`, `footer-descent`, 30 % par défaut). Un visuel posé dans
 * l'en-tête ne dispose donc que du reste : une marge égale à sa hauteur le
 * laisse déborder par le haut de la page.
 */
const HEADER_ASCENT = 0.3;

export const BASE_SOURCE = `#set page(paper: "a4", margin: 2.5cm)

#include "body.typ"
`;

export interface Placement {
  /** Fichier déjà copié dans backend/templates/assets. */
  file: string;
  widthPt: number;
  heightPt: number;
  /**
   * Bandeau à poser bord à bord. Vrai pour une bande découpée sur toute la
   * largeur d'une page ; faux pour un logo, qu'il ne faut pas étirer à la
   * largeur de la page — un visuel de 183 × 88 px y ferait 104 mm de haut.
   */
  fullBleed: boolean;
}

export interface BuildInput {
  analysis: Analysis;
  header?: Placement;
  footer?: Placement;
}

/**
 * Hauteur d'une image posée sur toute la largeur de la page, en millimètres :
 * c'est le minimum que doit valoir la marge du côté concerné.
 */
function bleedHeightMm(placement: Placement, pageWidthPt: number): number {
  if (placement.widthPt <= 0) return 0;
  const scale = pageWidthPt / placement.widthPt;
  return (placement.heightPt * scale) / PT_PER_MM;
}

export function buildLayout({
  analysis,
  header,
  footer,
}: BuildInput): LayoutConfig {
  const pageWidthPt = analysis.page.widthPt;
  const margins = { ...analysis.layout.margins };

  // Au dixième de millimètre : le champ « Marges » du panneau est étroit, et
  // rien ne se joue en deçà. Seul un bandeau bord à bord force la marge : un
  // logo est posé à hauteur fixe et tient dans la marge d'origine.
  const round = (mm: number) => Math.round(mm * 10) / 10;
  const needed = (placement: Placement) =>
    placement.fullBleed
      ? // `place` ancre au bord de la page : la hauteur rendue suffit.
        bleedHeightMm(placement, pageWidthPt) + BLEED_SLACK_MM
      : // Posé à hauteur fixe dans l'en-tête, dont Typst réserve une part à
        // l'écart avec le corps. Word compte son en-tête hors marge : ses 6 mm
        // lui suffisent et laisseraient ici le logo déborder de la page.
        INLINE_LOGO_HEIGHT_MM / (1 - HEADER_ASCENT) + BLEED_SLACK_MM;

  if (header) margins.top = round(Math.max(margins.top, needed(header)));
  if (footer) margins.bottom = round(Math.max(margins.bottom, needed(footer)));

  // sanitizeLayout borne tout : un relevé aberrant retombe sur les valeurs par défaut.
  return sanitizeLayout({
    ...analysis.layout,
    margins,
    header: {
      enabled: Boolean(header),
      text: "",
      logo: header?.file ?? null,
      fullBleed: Boolean(header?.fullBleed),
      align: "left",
      // Le bandeau porte déjà son propre trait s'il en a un.
      rule: false,
    },
    footer: {
      enabled: true,
      text: "",
      logo: footer?.file ?? null,
      fullBleed: Boolean(footer?.fullBleed),
      numbering: footer ? "none" : "n-of-total",
      align: "right",
      firstPage: true,
      rule: false,
    },
  });
}

export function buildSource(layout: LayoutConfig): string {
  return applyLayout(BASE_SOURCE, layout);
}
