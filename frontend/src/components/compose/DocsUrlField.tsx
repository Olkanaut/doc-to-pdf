import { useState } from "react";
import { Alert, Button, Input, Spinner, VariantType } from "@gouvfr-lasuite/ui-components";
import { docIdFromUrl } from "../../docsUrl";

interface Props {
  /** URL reconnue : la page charge le document via le backend Dots. */
  onOpen: (id: string, url: string) => void;
  /** Chargement en cours, porté par la page (aussi pour `?doc=` à l'arrivée). */
  loading: boolean;
  /** Message du serveur (403/404/422/502) à afficher, ou null. */
  error: string | null;
}

/** Champ « URL Docs » : reconnaît l'identifiant et le remonte ; l'appel réseau est à la page. */
export function DocsUrlField({ onOpen, loading, error }: Props) {
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <>
      <form
        className="compose-url"
        onSubmit={(e) => {
          e.preventDefault();
          const id = docIdFromUrl(url);
          setInvalid(!id);
          if (id) onOpen(id, url.trim());
        }}
      >
        <Input
          label="Coller l'URL d'un document Docs"
          fullWidth
          inputMode="url"
          value={url}
          disabled={loading}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!url.trim() || loading}>
          Ouvrir
        </Button>
      </form>
      {loading && (
        <div className="compose-url__status dots-muted" role="status">
          <Spinner size="sm" />
          Chargement…
        </div>
      )}
      {!loading && invalid && (
        // Le kit ne pose pas de rôle sur Alert : l'enveloppe porte la zone vive.
        <div role="alert">
          <Alert type={VariantType.ERROR}>
            {/* Un seul enfant : le contenu de l'Alert est un flex row-reverse (icône à droite). */}
            <span>
              URL non reconnue : attendu une adresse de la forme <code>…/docs/&lt;identifiant&gt;</code> ou{" "}
              <code>…/d/&lt;identifiant&gt;</code>.
            </span>
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
    </>
  );
}
