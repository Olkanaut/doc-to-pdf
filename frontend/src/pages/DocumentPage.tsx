import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  fetchDocumentContent,
  fetchDefaultTemplate,
  fetchTemplates,
  renderDocumentPdf,
  type DocsDocumentContent,
  type RenderInfo,
  type TemplateSummary,
} from "../api/client";
import { PdfPreview } from "../components/PdfPreview";
import { TemplateTiles } from "../components/compose/TemplateTiles";
import { DocInfoPopover } from "../components/document/DocInfoPopover";
import { SendMailModal } from "../components/document/SendMailModal";
import {
  Alert,
  Button,
  Input,
  Spinner,
  VariantType,
  type ButtonProps,
} from "@gouvfr-lasuite/ui-components";
import {
  Download,
  Mail,
  StackTemplate,
  Zoom,
} from "@gouvfr-lasuite/ui-components/icons";
import { docsUrl } from "../config";
import "../components/compose/compose.css";
import "../components/document/document-page.css";

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? "";

  return <DocumentView key={documentId} documentId={documentId} />;
}

type DocumentState =
  | { status: "loading" }
  | { status: "loaded"; document: DocsDocumentContent }
  | { status: "error"; message: string };

type PdfState =
  | { status: "idle" }
  | { status: "ready"; requestKey: string; url: string; info: RenderInfo }
  | { status: "error"; requestKey: string; message: string; details?: string };

type PdfViewState = PdfState | { status: "loading" };

/** `Button` du kit rendu en lien interne : navigation sans rechargement. */
function LinkButton({ to, onClick, ...props }: ButtonProps & { to: string }) {
  const navigate = useNavigate();
  return (
    <Button
      {...props}
      href={to}
      onClick={(e: MouseEvent<HTMLAnchorElement & HTMLButtonElement>) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}

function DocumentView({ documentId }: { documentId: string }) {
  const [searchParams] = useSearchParams();
  const requestedTemplateId = searchParams.get("template");
  const documentUrl = docsUrl(documentId);
  const [state, setState] = useState<DocumentState>({ status: "loading" });
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [pdfState, setPdfState] = useState<PdfState>({ status: "idle" });
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchDocumentContent(documentId)
      .then((result) => {
        if (!cancelled) setState({ status: "loaded", document: result });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              reason instanceof Error
                ? reason.message
                : "Impossible de charger le document.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchTemplates(), fetchDefaultTemplate().catch(() => null)])
      .then(([list, def]) => {
        if (cancelled) return;
        setTemplatesError(null);
        setTemplates(list);
        setDefaultId(def?.id ?? null);
        const initial =
          requestedTemplateId &&
          list.some((template) => template.id === requestedTemplateId)
            ? requestedTemplateId
            : (def?.id ?? list[0]?.id ?? "");
        setTemplateId(initial);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setTemplatesError(
            reason instanceof Error
              ? reason.message
              : "Impossible de charger les templates.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestedTemplateId]);

  useEffect(() => {
    const requestKey =
      state.status === "loaded" && templateId
        ? `${documentId}:${templateId}`
        : null;
    if (!requestKey) {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      return;
    }

    const controller = new AbortController();
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }

    renderDocumentPdf(documentId, templateId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setPdfState({
            status: "error",
            requestKey,
            message: result.error,
            details: result.details,
          });
          return;
        }

        const url = URL.createObjectURL(result.blob);
        pdfUrlRef.current = url;
        setPdfState({ status: "ready", requestKey, url, info: result.info });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setPdfState({
          status: "error",
          requestKey,
          message:
            reason instanceof Error
              ? reason.message
              : "Impossible de générer le PDF.",
        });
      });

    return () => controller.abort();
  }, [documentId, state.status, templateId]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  const renderRequestKey =
    state.status === "loaded" && templateId
      ? `${documentId}:${templateId}`
      : null;
  const activePdfState: PdfViewState =
    renderRequestKey &&
    pdfState.status !== "idle" &&
    pdfState.requestKey === renderRequestKey
      ? pdfState
      : renderRequestKey
        ? { status: "loading" }
        : { status: "idle" };

  const blockCount =
    activePdfState.status === "ready"
      ? activePdfState.info.blockCount
      : state.status === "loaded"
        ? state.document.blocks.length
        : null;
  const updatedAt =
    state.status === "loaded"
      ? new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(state.document.updatedAt))
      : null;
  const title =
    state.status === "loaded" ? state.document.title : "Document Docs";
  const fileName = `${documentId || "document"}.pdf`;
  const unsupported =
    activePdfState.status === "ready"
      ? Object.entries(activePdfState.info.unsupported)
      : [];
  const unsupportedTotal = unsupported.reduce(
    (total, [, count]) => total + count,
    0,
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(needle));
  }, [templates, query]);

  return (
    <div className="doc-shell">
      <aside className="doc-rail" aria-label="Document et templates">
        <div className="doc-rail__doc">
          <div className="doc-rail__name-row">
            <span className="doc-rail__name" title={title}>
              {title}
            </span>
            <DocInfoPopover
              title={title}
              documentId={documentId}
              blockCount={blockCount}
              updatedAt={updatedAt}
            />
          </div>
          <div className="doc-rail__acts">
            {/* Docs vit sur une autre origine : lien franc, pas de navigation interne. */}
            <Button
              size="small"
              variant="tertiary"
              color="neutral"
              href={documentUrl}
            >
              Ouvrir dans Docs
            </Button>
            <LinkButton to="/" size="small" variant="tertiary" color="neutral">
              Changer
            </LinkButton>
          </div>
        </div>

        {state.status === "error" && (
          <div role="alert">
            <Alert type={VariantType.ERROR}>{state.message}</Alert>
          </div>
        )}

        <Input
          label="Rechercher une template"
          hideLabel
          variant="classic"
          fullWidth
          type="search"
          placeholder="Rechercher une template"
          icon={<Zoom aria-hidden="true" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="doc-rail__templates">
          {templatesLoading && (
            <p className="dots-muted doc-rail__empty" role="status">
              Chargement des templates…
            </p>
          )}
          {templatesError && (
            <div role="alert">
              <Alert type={VariantType.ERROR}>{templatesError}</Alert>
            </div>
          )}
          {!templatesLoading && !templatesError && templates.length === 0 && (
            <p className="dots-muted doc-rail__empty">
              Aucune template disponible pour le moment.
            </p>
          )}
          {!templatesLoading &&
            !templatesError &&
            templates.length > 0 &&
            (shown.length === 0 ? (
              <p className="dots-muted doc-rail__empty">
                Aucune template ne porte ce nom.
              </p>
            ) : (
              <TemplateTiles
                templates={shown}
                selectedId={templateId}
                defaultId={defaultId}
                onSelect={setTemplateId}
              />
            ))}
        </div>
      </aside>
      <section className="doc-view" aria-label="Aperçu PDF">
        {(activePdfState.status === "error" || unsupportedTotal > 0) && (
          <div className="doc-view__notices">
            {activePdfState.status === "error" && (
              <div role="alert">
                <Alert type={VariantType.ERROR}>
                  <div>
                    <strong>{activePdfState.message}</strong>
                    {activePdfState.details && (
                      <details>
                        <summary>Détails</summary>
                        <pre className="dots-mono">
                          {activePdfState.details}
                        </pre>
                      </details>
                    )}
                  </div>
                </Alert>
              </div>
            )}
            {unsupportedTotal > 0 && (
              <div role="status">
                <Alert type={VariantType.INFO}>
                  {unsupportedTotal} bloc{unsupportedTotal > 1 ? "s" : ""} sans
                  équivalent Typst (
                  {unsupported
                    .map(([type, count]) => `${type} ×${count}`)
                    .join(", ")}
                  ) ne
                  {unsupportedTotal > 1 ? " figurent" : " figure"} pas dans le
                  PDF.
                </Alert>
              </div>
            )}
          </div>
        )}

        <div className="doc-view__preview">
          <PdfPreview
            pdfUrl={
              activePdfState.status === "ready" ? activePdfState.url : null
            }
            fileName={fileName}
          />
        </div>

        <div className="doc-acts">
          {activePdfState.status === "loading" && (
            <span className="dots-muted" role="status">
              <Spinner size="sm" /> Génération…
            </span>
          )}
          {templateId && (
            <LinkButton
              to={`/t/${templateId}/layout`}
              size="small"
              variant="tertiary"
              color="neutral"
              icon={<StackTemplate aria-hidden="true" />}
            >
              Mise en page
            </LinkButton>
          )}
          <Button
            type="button"
            size="small"
            variant="secondary"
            icon={<Mail aria-hidden="true" />}
            onClick={() => setMailOpen(true)}
          >
            Envoyer
          </Button>
          <Button
            size="small"
            color="brand"
            icon={<Download aria-hidden="true" />}
            href={
              activePdfState.status === "ready" ? activePdfState.url : undefined
            }
            download={activePdfState.status === "ready" ? fileName : undefined}
            disabled={activePdfState.status !== "ready"}
          >
            Télécharger
          </Button>
        </div>
      </section>
      {mailOpen && (
        <SendMailModal
          documentTitle={title}
          fileName={fileName}
          pdfReady={activePdfState.status === "ready"}
          onClose={() => setMailOpen(false)}
        />
      )}
    </div>
  );
}
