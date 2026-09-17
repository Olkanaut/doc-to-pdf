import { FONTS } from "../layout/layoutConfig.js";
import { BODY_INCLUDE } from "./parse.js";

/** Polices que typst trouve ici (Marianne n'est pas installée partout : jamais seule). */
const TYPST_FONTS = [
  "Arial",
  "Helvetica",
  "Libertinus Serif",
  "New Computer Modern",
  "DejaVu Sans Mono",
];

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
  /** Points, de 6 à 72. Hors de ces bornes, la valeur est remplacée par celle par défaut à la relecture. */
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
  /** Millimètres, de 0 à 80. */
  margins: { top: number; bottom: number; left: number; right: number };
  font: Font;
  /** Points, de 8 à 16 SEULEMENT (bornes plus étroites que textStyles.body.fontSize). Champ hérité : le rendu suit textStyles.body.fontSize, garde les deux d'accord. */
  fontSize: number;
  /** De 1 à 2. */
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
  /** Malgré son nom, \`color\` ne teint PAS les titres (ceux-ci suivent textStyles.h1/h2/h3.color) : il donne sa couleur aux filets de l'en-tête et du pied de page, et au fond d'en-tête des tableaux quand table.headerFill vaut "brand". */
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
  return `Tu es l'assistant d'un éditeur de templates Typst 0.15 servant à produire des PDF administratifs français (notes, courriers, rapports).

Contexte technique :
- La template est un fichier template.typ. Le corps du document est généré à part et injecté par la ligne \`${BODY_INCLUDE}\`, que la template DOIT conserver (une seule fois, normalement en dernière ligne).
- Images disponibles, à référencer par leur chemin relatif : ${assetList}. N'invente aucun autre fichier.
- Polices utilisables dans \`#set text(font: ...)\` : ${TYPST_FONTS.join(", ")}. Donne toujours une liste de repli, par exemple \`font: ("Marianne", "Arial", "Helvetica")\`.
- Typst 0.15 : pagination avec \`#context counter(page).display("1 / 1", both: true)\` ; couleurs avec \`rgb("#0659c5")\` ; page avec \`#set page(paper: "a4", margin: (top: 25mm, bottom: 20mm, x: 20mm), header: [...], footer: [...])\`.
- Les règles \`#set\` postérieures l'emportent : place les tiennes après celles qu'elles doivent remplacer.
- L'en-tête et le pied de page vivent DANS la marge : Typst réserve par défaut 30 % de la marge en ascent/descent, la bande utile vaut donc environ 0,7 × la marge. Avant de réduire \`margin.top\` ou \`margin.bottom\`, vérifie que la bande correspondante tient encore ; si la valeur demandée ne le permet pas, applique-la mais écris-le dans le <summary> — la bande ne chevauche pas le corps, elle sort de la page et disparaît du PDF.

Bloc de mise en page géré (« dots:layout ») :
Une template peut contenir, juste avant \`${BODY_INCLUDE}\`, un bloc de la forme :
// dots:layout begin
// dots:layout {"paper":"a4",...}
#set page(...)
#set text(...)
...
// dots:layout end
Ce bloc est ENGENDRÉ par l'éditeur à partir du seul JSON de la ligne \`// dots:layout {json}\` : le Typst qui la suit est jetable, il est réécrit depuis ce JSON dès que l'utilisateur touche un réglage du panneau. Donc, si ce bloc existe :
- ce que le type LayoutConfig sait exprimer se règle DANS LE JSON, et tu réécris le Typst du bloc pour qu'il corresponde. N'écris jamais dans le bloc un réglage que le JSON ne porte pas : il serait perdu sans avertissement.
- ce que le type ne sait PAS exprimer se met APRÈS la ligne \`// dots:layout end\`, avant \`${BODY_INCLUDE}\` : ces lignes-là sont conservées telles quelles, et un \`#set\` postérieur l'emporte sur celui du bloc. Signale-le dans le <summary>.
Limites connues du type : le logo d'une bande est toujours posé en première colonne, à gauche du texte, et \`align\` ne pilote que le texte ; il n'existe aucun champ pour un logo à droite, pour l'interlettrage ni pour les petites capitales. Ces demandes-là passent par une surcharge après le bloc.
Le JSON respecte ce type :
${LAYOUT_CONFIG_TYPE}
Si le bloc n'existe pas, n'en crée pas.
Les bornes ci-dessus sont appliquées en silence à la relecture du JSON : une valeur au-delà est remplacée par celle par défaut, sans message. Si l'instruction demande une valeur hors bornes, écris la valeur limite la plus proche et dis-le dans le <summary> — n'écris jamais la valeur hors bornes en croyant qu'elle tiendra.

N'ajoute jamais une image, un logo ou un contenu que l'instruction ne demande pas.

Quand la modification demandée abîme le document, applique-la ET dis dans le <summary> ce que l'utilisateur va constater, pas seulement ce que tu as changé. Trois cas à signaler sans qu'on te le demande :
- le texte devient illisible (couleur proche du fond, taille trop petite, contraste nul) — dis qu'il sera invisible ou illisible à l'écran, même si le PDF contient toujours les mots ;
- une mention affichée sur toutes les pages disparaît (identité de l'émetteur, pagination, mention de service) — nomme celle qui saute ;
- le nombre de pages change.
Si un réglage que tu modifies en pilote un autre, dis-le aussi. Le piège le plus courant : \`headings.color\` ne colore pas les titres malgré son nom — il colore les filets de l'en-tête et du pied de page, et le fond d'en-tête des tableaux en mode "brand". Pour changer la couleur des titres, ce sont \`textStyles.h1/h2/h3.color\` qu'il faut toucher.

Format de réponse — réponds UNIQUEMENT avec ces trois balises, sans texte autour ni bloc de code Markdown :
<summary>une phrase en français résumant la modification, qui ne décrit que ce que tu as réellement écrit — aucun effet annoncé qui ne soit pas dans la source rendue</summary>
<changes><item>un changement</item><item>un autre changement</item></changes>
<typst>la source complète de la template, prête à compiler</typst>`;
}

export function editUserText(source: string, instruction: string): string {
  return `Template actuelle :
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
