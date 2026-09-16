export interface TextStyles {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export interface TextInline {
  type: "text";
  text: string;
  styles?: TextStyles;
}

export interface LinkInline {
  type: "link";
  href: string;
  content: TextInline[];
}

/**
 * Lien interne Docs, inséré via « / » dans l'éditeur. Ne porte PAS de `text` :
 * son libellé visible est dans props.title.
 */
export interface InterlinkingInline {
  type: "interlinkingLinkInline";
  props: { docId?: string; title?: string; disabled?: boolean; trigger?: string };
}

export type InlineContent = TextInline | LinkInline | InterlinkingInline;

export interface HeadingBlock {
  id?: string;
  type: "heading";
  props: { level: 1 | 2 | 3 };
  content: InlineContent[];
}

export interface ParagraphBlock {
  id?: string;
  type: "paragraph";
  content: InlineContent[];
}

export interface BulletListItemBlock {
  id?: string;
  type: "bulletListItem";
  content: InlineContent[];
  children?: Block[];
}

export interface NumberedListItemBlock {
  id?: string;
  type: "numberedListItem";
  content: InlineContent[];
  children?: Block[];
}

export interface TableCell {
  content: InlineContent[];
}

export interface TableBlock {
  id?: string;
  type: "table";
  content: {
    rows: { cells: TableCell[] }[];
  };
}

export interface ImageBlock {
  id?: string;
  type: "image";
  props: {
    url: string;
    caption?: string;
  };
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | BulletListItemBlock
  | NumberedListItemBlock
  | TableBlock
  | ImageBlock;

export interface Fixture {
  id: string;
  name: string;
  blocks: Block[];
}
