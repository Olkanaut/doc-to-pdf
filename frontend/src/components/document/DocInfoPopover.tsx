import { useRef, useState } from "react";
import { Button, Popover } from "@gouvfr-lasuite/ui-components";
import { Info } from "@gouvfr-lasuite/ui-components/icons";

interface Props {
  title: string;
  documentId: string;
  blockCount: number | null;
  updatedAt: string | null;
}

/**
 * Les informations du document dans un ⓘ, et non dans une barre pleine largeur :
 * dans un rail étroit le nom est tronqué, le popover le redonne en entier, avec
 * l'identifiant, le nombre de blocs et la date.
 *
 * Popover du kit : il se place sous l'ancre (bascule au-dessus s'il déborde) et
 * se ferme au clic extérieur, à condition que l'ancre soit `position: relative`.
 */
export function DocInfoPopover({ title, documentId, blockCount, updatedAt }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div
      className="doc-info"
      ref={anchor}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <Button
        type="button"
        size="small"
        variant="tertiary"
        color="neutral"
        icon={<Info aria-hidden="true" />}
        aria-label="Informations sur le document"
        aria-expanded={open}
        title="Informations"
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <Popover parentRef={anchor} onClickOutside={() => setOpen(false)}>
          <div className="doc-info__card">
            <p className="doc-info__title">{title}</p>
            <dl className="doc-info__list">
              <dt>Identifiant</dt>
              <dd className="dots-mono doc-info__id">{documentId}</dd>
              <dt>Contenu</dt>
              <dd>{blockCount === null ? "—" : `${blockCount} bloc${blockCount === 1 ? "" : "s"}`}</dd>
              <dt>Dernière mise à jour</dt>
              <dd>{updatedAt ?? "—"}</dd>
            </dl>
          </div>
        </Popover>
      )}
    </div>
  );
}
