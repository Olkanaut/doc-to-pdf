import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "./pdf-preview.css";

/**
 * Le worker vient de la version installée, servi par Vite. Pas de copie dans
 * public/ à resynchroniser à chaque montée de version de pdfjs.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface Props {
  pdfUrl: string | null;
  fileName: string;
  /**
   * `width` : la page occupe toute la largeur du cadre (défaut).
   * `page` : la page entière tient dans le cadre, en largeur comme en hauteur.
   */
  fit?: "width" | "page";
}

/** En dessous, une page « entière » devient illisible : on préfère faire défiler. */
const MIN_FIT_PAGE_WIDTH = 480;

/**
 * Aperçu du PDF rendu par react-pdf, et non par la visionneuse du navigateur :
 * celle-ci impose sa barre d'outils et son fond sombre, qu'aucune CSS de l'app
 * ne peut atteindre puisqu'elle vit dans une iframe d'une autre origine. Ici il
 * ne reste que les pages, qui défilent.
 *
 * react-pdf arrive déjà par le kit La Suite, qui s'en sert pour son FilePreview.
 */
export function PdfPreview({ pdfUrl, fileName, fit = "width" }: Props) {
  const [pageCount, setPageCount] = useState(0);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  // Largeur / hauteur de la première page ; A4 portrait tant qu'elle n'est pas chargée.
  const [pageRatio, setPageRatio] = useState(1 / Math.SQRT2);
  const scroller = useRef<HTMLDivElement>(null);

  // react-pdf rend un canvas de taille fixe : il faut lui donner une largeur,
  // et la recalculer quand le cadre change (panneau replié, fenêtre redimensionnée).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setFrame({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pdfUrl]);

  const pageWidth =
    fit === "page"
      ? Math.min(
          frame.width,
          Math.max(frame.height * pageRatio, MIN_FIT_PAGE_WIDTH),
        )
      : frame.width;

  if (!pdfUrl) {
    return <div className="pdf-placeholder">Le PDF généré s'affichera ici.</div>;
  }

  return (
    <div className="pdf-preview">
      <div className="pdf-preview-toolbar">
        <a href={pdfUrl} download={fileName}>
          Télécharger le PDF
        </a>
      </div>
      {/* `aria-label` et non `title` : ce dernier fait flotter une infobulle
          au-dessus des pages dès qu'on survole l'aperçu. */}
      <div className="pdf-scroll" ref={scroller} role="group" aria-label="Aperçu du PDF">
        <Document
          file={pdfUrl}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
          loading={
            <p className="pdf-scroll__message" role="status">
              Chargement de l'aperçu…
            </p>
          }
          error={
            <p className="pdf-scroll__message" role="alert">
              L'aperçu n'a pas pu être affiché.
            </p>
          }
          noData={null}
        >
          {/* ponytail: toutes les pages sont montées d'un coup. Au-delà d'une
              trentaine, ne monter que les pages visibles. */}
          {pageWidth > 0 &&
            Array.from({ length: pageCount }, (_, i) => (
              <Page
                key={i}
                pageNumber={i + 1}
                width={pageWidth}
                className="pdf-page"
                onLoadSuccess={
                  i === 0
                    ? (page) => {
                        const { width, height } = page.getViewport({ scale: 1 });
                        if (width > 0 && height > 0) setPageRatio(width / height);
                      }
                    : undefined
                }
              />
            ))}
        </Document>
      </div>
    </div>
  );
}
