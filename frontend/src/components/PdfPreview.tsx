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
}

/**
 * Aperçu du PDF rendu par react-pdf, et non par la visionneuse du navigateur :
 * celle-ci impose sa barre d'outils et son fond sombre, qu'aucune CSS de l'app
 * ne peut atteindre puisqu'elle vit dans une iframe d'une autre origine. Ici il
 * ne reste que les pages, qui défilent.
 *
 * react-pdf arrive déjà par le kit La Suite, qui s'en sert pour son FilePreview.
 */
export function PdfPreview({ pdfUrl, fileName }: Props) {
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  // react-pdf rend un canvas de taille fixe : il faut lui donner une largeur,
  // et la recalculer quand le cadre change (panneau replié, fenêtre redimensionnée).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setPageWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [pdfUrl]);

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
              <Page key={i} pageNumber={i + 1} width={pageWidth} className="pdf-page" />
            ))}
        </Document>
      </div>
    </div>
  );
}
