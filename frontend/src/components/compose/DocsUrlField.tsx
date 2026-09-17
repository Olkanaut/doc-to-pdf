import { useEffect, useId, useRef, useState } from "react";
import { Alert, Button, Input, Spinner, VariantType } from "@gouvfr-lasuite/ui-components";
import { searchDocsDocuments, type DocsDocumentSummary } from "../../api/client";
import { docIdFromUrl } from "../../docsUrl";

interface Props {
  /** URL reconnue : la page charge le document via le backend Dots. */
  onOpen: (id: string, url: string) => void;
  /** Chargement en cours, porté par la page (aussi pour `?doc=` à l'arrivée). */
  loading: boolean;
  /** Message du serveur (403/404/422/502) à afficher, ou null. */
  error: string | null;
}

const SEARCH_DELAY_MS = 300;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `Modifié le ${dateFormatter.format(date)}`;
}

/** Champ hybride : URL/UUID Docs direct ou recherche des documents accessibles. */
export function DocsUrlField({ onOpen, loading, error }: Props) {
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [results, setResults] = useState<DocsDocumentSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const trimmed = value.trim();
  const directId = docIdFromUrl(value);
  const canSubmit = Boolean(trimmed) && !loading && (Boolean(directId) || results.length > 0);

  useEffect(() => {
    if (!trimmed || directId || trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      searchDocsDocuments(trimmed, 8, controller.signal)
        .then((documents) => {
          setResults(documents);
          setActiveIndex(0);
          setOpen(true);
        })
        .catch((searchErrorValue: Error) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setSearchError(searchErrorValue.message);
          setOpen(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [directId, trimmed]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function openDocument(id: string) {
    setOpen(false);
    setInvalid(null);
    onOpen(id, value.trim());
  }

  function submitCurrent() {
    if (directId) {
      openDocument(directId);
      return;
    }

    const selected = results[activeIndex] ?? results[0];
    if (selected) {
      openDocument(selected.id);
      return;
    }

    setInvalid("Collez une URL Docs ou sélectionnez un document dans les résultats.");
  }

  return (
    <div className="docs-search" ref={rootRef}>
      <form
        className="compose-url"
        onSubmit={(e) => {
          e.preventDefault();
          submitCurrent();
        }}
        onKeyDown={(e) => {
          if (!open || (!results.length && !searchError)) return;
          if (results.length === 0) {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === "Enter" && !directId && results.length > 0) {
            e.preventDefault();
            submitCurrent();
          }
        }}
      >
        <Input
          label="Coller l'URL d'un document Docs"
          hideLabel
          variant="classic"
          fullWidth
          inputMode={directId ? "url" : "search"}
          placeholder="Coller une URL Docs ou rechercher un document"
          value={value}
          disabled={loading}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          onChange={(e) => {
            const nextValue = e.target.value;
            const nextTrimmed = nextValue.trim();
            setValue(nextValue);
            setInvalid(null);
            setResults([]);
            setSearchLoading(nextTrimmed.length >= 2 && !docIdFromUrl(nextValue));
            setSearchError(null);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => {
            if (trimmed.length >= 2 && !directId) setOpen(true);
          }}
        />
        <Button type="submit" variant="secondary" disabled={!canSubmit}>
          Ouvrir
        </Button>
      </form>
      {open && !directId && trimmed.length >= 2 && (
        <div className="docs-search__popover" role="listbox" id={listboxId}>
          {searchLoading && (
            <div className="docs-search__status" role="status">
              <Spinner size="sm" />
              Recherche…
            </div>
          )}
          {!searchLoading && searchError && (
            <div className="docs-search__empty" role="alert">
              Impossible de rechercher dans Docs.
            </div>
          )}
          {!searchLoading && !searchError && results.length === 0 && (
            <div className="docs-search__empty">Aucun document trouvé.</div>
          )}
          {!searchLoading &&
            !searchError &&
            results.map((document, index) => (
              <button
                className="docs-search__option"
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                key={document.id}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openDocument(document.id)}
              >
                <span className="docs-search__title">{document.title || "Sans titre"}</span>
                <span className="docs-search__meta">{formatUpdatedAt(document.updatedAt)}</span>
              </button>
            ))}
        </div>
      )}
      {(loading || searchLoading) && !open && (
        <div className="compose-url__status dots-muted" role="status">
          <Spinner size="sm" />
          {loading ? "Chargement…" : "Recherche…"}
        </div>
      )}
      {!loading && invalid && (
        // Le kit ne pose pas de rôle sur Alert : l'enveloppe porte la zone vive.
        <div role="alert">
          <Alert type={VariantType.ERROR}>
            {/* Un seul enfant : le contenu de l'Alert est un flex row-reverse (icône à droite). */}
            <span>{invalid}</span>
          </Alert>
        </div>
      )}
      {!loading && !invalid && error && (
        <div role="alert">
          <Alert type={VariantType.ERROR}>
            <span>{error}</span>
          </Alert>
        </div>
      )}
    </div>
  );
}
