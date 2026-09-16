import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Badge, Button, Input, Spinner, VariantType } from "@gouvfr-lasuite/ui-components";
import { ChevronRight, Doc } from "@gouvfr-lasuite/ui-components/icons";
import { fetchDocsDocuments, type DocsList, type DocsListItem } from "../api/client";
import { docIdFromUrl } from "../docsUrl";
import "./home.css";

const ROLE_LABEL: Record<NonNullable<DocsListItem["role"]>, string> = {
  owner: "Propriétaire",
  administrator: "Administrateur",
  editor: "Éditeur",
  commenter: "Commentateur",
  reader: "Lecteur",
};

const relativeFormat = new Intl.RelativeTimeFormat("fr", { numeric: "auto", style: "short" });
const shortDate = new Intl.DateTimeFormat("fr", { day: "numeric", month: "short", year: "numeric" });

/** « il y a 10 min », « hier », « il y a 3 j » ; au-delà de 30 jours, la date courte. */
function formatUpdated(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormat.format(0, "second");
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), "hour");
  const days = Math.round(seconds / 86400);
  if (Math.abs(days) <= 30) return relativeFormat.format(days, "day");
  return shortDate.format(date);
}

/** Loupe : le kit n'a pas d'icône de recherche. */
function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Accueil : un document Docs (recherche ou URL collée) → page Rendu avec le gabarit par défaut. */
export function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Filtre de la liste affichée (la saisie n'est appliquée qu'après le débounce).
  const [applied, setApplied] = useState("");
  const [list, setList] = useState<DocsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Numéro de la dernière requête demandée : un résultat plus ancien est jeté.
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function load(title: string, page: number) {
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDocsDocuments({ title: title || undefined, page });
      if (n !== seq.current) return; // dépassée par une requête plus récente
      setApplied(title);
      // Page suivante : les lignes s'ajoutent à la suite.
      setList((prev) => (page > 1 && prev ? { ...result, items: [...prev.items, ...result.items] } : result));
    } catch (e) {
      if (n !== seq.current) return;
      setError((e as Error).message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }

  // Chargement immédiat à l'arrivée ; ensuite, recherche 300 ms après la dernière frappe.
  const first = useRef(true);
  useEffect(() => {
    const delay = first.current ? 0 : 300;
    first.current = false;
    timer.current = setTimeout(() => void load(query.trim(), 1), delay);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = docIdFromUrl(query);
    if (id) {
      navigate(`/docs/${id}`);
      return;
    }
    clearTimeout(timer.current);
    void load(query.trim(), 1);
  }

  const items = list?.items ?? [];
  const filtered = applied !== "";
  // Sans session Docs, la liste est vide : un seul avis, pas de liste vide en plus.
  const noSession = list !== null && !list.hasSession && list.total === 0;

  return (
    <div className="dots-page">
      <div className="dots-page-header">
        <div>
          <h1>Un doc, un PDF</h1>
          <p>Choisissez un document Docs : le PDF est rendu avec votre gabarit par défaut.</p>
        </div>
      </div>

      <form className="home-search" onSubmit={handleSubmit}>
        <Input
          label="Rechercher un document par son nom"
          fullWidth
          type="search"
          autoComplete="off"
          icon={<SearchIcon />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button color="brand" type="submit">
          Ouvrir
        </Button>
      </form>

      {error && (
        // Le kit ne pose pas de rôle sur Alert : l'enveloppe porte la zone vive.
        <div role="alert">
          <Alert type={VariantType.ERROR}>
            {/* Un seul enfant : le contenu de l'Alert est un flex row-reverse (icône à droite). */}
            <span>{error}</span>
          </Alert>
        </div>
      )}

      {noSession ? (
        <Alert type={VariantType.INFO}>
          <span>Connectez-vous à Docs dans ce navigateur pour voir vos documents.</span>
        </Alert>
      ) : (
        <section className="home-list" aria-labelledby="home-list-title">
          <div className="home-list__head">
            <h2 id="home-list-title">
              {filtered ? `Résultats pour « ${applied} »` : "Vos derniers documents dans Docs"}
            </h2>
            {list && (
              <span className="dots-muted">
                {items.length} sur {list.total}
              </span>
            )}
          </div>
          {loading && (
            <div className="home-status dots-muted" role="status">
              <Spinner size="sm" />
              Chargement…
            </div>
          )}
          {!loading && list && items.length === 0 && (
            <p className="dots-muted">
              {filtered
                ? `Aucun document dont le nom contient « ${applied} ».`
                : "Aucun document à afficher : votre session Docs a peut-être expiré. Ouvrez Docs, connectez-vous, puis rechargez cette page."}
            </p>
          )}
          {items.length > 0 && (
            <ul className="home-docs">
              {items.map((d) => (
                <li key={d.id}>
                  <Link to={`/docs/${d.id}`} className="home-doc">
                    <Doc aria-hidden="true" size={20} className="home-doc__icon" />
                    <span className="home-doc__title">{d.title}</span>
                    {d.role && <Badge type="neutral">{ROLE_LABEL[d.role]}</Badge>}
                    <span className="home-doc__date dots-muted">modifié {formatUpdated(d.updatedAt)}</span>
                    <ChevronRight aria-hidden="true" size={20} className="home-doc__chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {list?.hasMore && (
            <Button variant="tertiary" disabled={loading} onClick={() => void load(applied, list.page + 1)}>
              Voir plus
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
