interface Props {
  pdfUrl: string | null;
  fileName: string;
}

export function PdfPreview({ pdfUrl, fileName }: Props) {
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
      <iframe title="Aperçu du PDF" src={pdfUrl} />
    </div>
  );
}
