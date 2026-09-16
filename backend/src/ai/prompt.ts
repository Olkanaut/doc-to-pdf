import { FONTS } from "../layout/layoutConfig.js";
import { BODY_INCLUDE } from "./parse.js";

/** Polices que typst trouve ici (Marianne n'est pas installée partout : jamais seule). */
const TYPST_FONTS = ["Arial", "Helvetica", "Libertinus Serif", "New Computer Modern", "DejaVu Sans Mono"];

/**
 * Copie textuelle de LayoutConfig (backend/src/layout/layoutConfig.ts). Un type
 * TypeScript n'existe pas à l'exécution : si le type change, reporter ici.
 */
const LAYOUT_CONFIG_TYPE = `type PaperSize = "a4" | "a5" | "us-letter";
type Align = "left" | "center" | "right";
type Numbering = "none" | "n" | "n-of-total" | "page-n-of-total";
type PageBandMode = "all" | "except-first" | "first-only" | "different-first";
type Font = ${FONTS.map((f) => JSON.stringify(f)).join(" | ")};
type TextStyleKey = "body" | "h1" | "h2" | "h3";

interface TextStyle {
  font: Font;
  /** Points. */
  fontSize: number;
  color: string;
}

interface HeaderContent {
  text: string;
  /** Nom de fichier seul, sans "assets/" (ex. "logo-ministere.png") ; le Typst y accède par image("assets/<logo>"). */
  logo: string | null;
  fullBleed: boolean;
  align: Align;
  rule: boolean;
}

interface FooterContent extends HeaderContent {
  numbering: Numbering;
}

interface LayoutConfig {
  paper: PaperSize;
  orientation: "portrait" | "landscape";
  /** Millimètres. */
  margins: { top: number; bottom: number; left: number; right: number };
  font: Font;
  /** Points. */
  fontSize: number;
  lineHeight: number;
  /** Styles typographiques de base. */
  textStyles: Record<TextStyleKey, TextStyle>;
  header: {
    enabled: boolean;
    mode: PageBandMode;
    first: HeaderContent;
    text: string;
    logo: string | null;
    fullBleed: boolean;
    align: Align;
    rule: boolean;
  };
  footer: {
    enabled: boolean;
    mode: PageBandMode;
    first: FooterContent;
    text: string;
    logo: string | null;
    fullBleed: boolean;
    numbering: Numbering;
    align: Align;
    /** Ancien booléen de compatibilité ; mode pilote le rendu. */
    firstPage: boolean;
    rule: boolean;
  };
  headings: { scale: "compact" | "normal" | "large"; color: string };
  /** Allure des tableaux ; leur structure (colonnes, fusions, contenu) vient du document. */
  table: {
    stroke: "none" | "light" | "full";
    headerFill: "none" | "grey" | "brand";
    zebra: boolean;
    fontSize: "inherit" | "small";
  };
}`;

/** @param assets chemins relatifs des images disponibles (ex. "assets/logo-ministere.png"). */
export function systemPrompt(assets: string[]): string {
  const assetList = assets.length ? assets.join(", ") : "aucune";
  return `Tu es l'assistant d'un éditeur de gabarits Typst 0.15 servant à produire des PDF administratifs français (notes, courriers, rapports).

Contexte technique :
- Le gabarit est un fichier template.typ. Le corps du document est généré à part et injecté par la ligne \`${BODY_INCLUDE}\`, que le gabarit DOIT conserver (une seule fois, normalement en dernière ligne).
- Images disponibles, à référencer par leur chemin relatif : ${assetList}. N'invente aucun autre fichier.
- Polices utilisables dans \`#set text(font: ...)\` : ${TYPST_FONTS.join(", ")}. Donne toujours une liste de repli, par exemple \`font: ("Marianne", "Arial", "Helvetica")\`.
- Typst 0.15 : pagination avec \`#context counter(page).display("1 / 1", both: true)\` ; couleurs avec \`rgb("#0659c5")\` ; page avec \`#set page(paper: "a4", margin: (top: 25mm, bottom: 20mm, x: 20mm), header: [...], footer: [...])\`.
- Les règles \`#set\` postérieures l'emportent : place les tiennes après celles qu'elles doivent remplacer.

Bloc de mise en page géré (« dots:layout ») :
Un gabarit peut contenir, juste avant \`${BODY_INCLUDE}\`, un bloc de la forme :
// dots:layout begin
// dots:layout {"paper":"a4",...}
#set page(...)
#set text(...)
...
// dots:layout end
Ce bloc est régénéré par l'éditeur de mise en page à partir du JSON de la ligne \`// dots:layout {json}\`. Si ce bloc existe, tout changement de format de page, de marges, d'en-tête, de pied de page ou de typographie se fait À L'INTÉRIEUR du bloc, et tu mets à jour le JSON pour qu'il reste cohérent avec le Typst. Le JSON respecte ce type :
${LAYOUT_CONFIG_TYPE}
Si le bloc n'existe pas, n'en crée pas.

Format de réponse — réponds UNIQUEMENT avec ces trois balises, sans texte autour ni bloc de code Markdown :
<summary>une phrase en français résumant la modification</summary>
<changes><item>un changement</item><item>un autre changement</item></changes>
<typst>la source complète du gabarit, prête à compiler</typst>`;
}

export function editUserText(source: string, instruction: string): string {
  return `Gabarit actuel :
<template>
${source}
</template>

Instruction :
${instruction}`;
}

export function fromPdfUserText(name?: string): string {
  const target = name ? ` pour le gabarit « ${name} »` : "";
  return `Le PDF joint est un document de référence${target}. Écris le gabarit Typst qui reproduit sa charte graphique : en-tête (texte, disposition), logo (une des images disponibles si elle convient, sinon un rectangle de couleur de dimensions proches), pied de page et pagination, typographie (police, taille, couleur des titres), marges et format de page. Ne reproduis pas le contenu du document : le corps vient de \`${BODY_INCLUDE}\`.`;
}
