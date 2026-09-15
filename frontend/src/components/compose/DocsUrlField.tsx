import { useState } from "react";

/** Identifiant d'une URL Docs : `/docs/<id>` ou `/d/<id>`, URL complète tolérée. */
function docIdFromUrl(url: string): string | null {
  const match = /(?:^|\/)(?:d|docs)\/([A-Za-z0-9-]+)/.exec(url.trim());
  return match ? match[1] : null;
}

/** Champ « URL Docs » : reconnaît l'identifiant, rien de plus (pas d'appel réseau). */
export function DocsUrlField() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<{ id: string } | { invalid: true } | null>(null);

  return (
    <>
      <form
        className="compose-url"
        onSubmit={(e) => {
          e.preventDefault();
          const id = docIdFromUrl(url);
          setResult(id ? { id } : { invalid: true });
        }}
      >
        <label className="dots-field">
          <span>Coller l'URL d'un document Docs</span>
          <input
            type="text"
            inputMode="url"
            placeholder="https://docs.numerique.gouv.fr/docs/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button type="submit" className="dots-btn" disabled={!url.trim()}>
          Ouvrir
        </button>
      </form>
      {result && "id" in result && (
        <div className="dots-notice compose-notice" role="status">
          <span>
            La récupération depuis Docs (API Resource Server + ProConnect) n'est pas encore branchée :
            identifiant <code>{result.id}</code> reconnu, choisissez un document d'exemple ci-dessous.
          </span>
        </div>
      )}
      {result && "invalid" in result && (
        <div className="dots-notice dots-notice--error compose-notice" role="alert">
          <span>
            URL non reconnue : attendu une adresse de la forme <code>…/docs/&lt;identifiant&gt;</code> ou{" "}
            <code>…/d/&lt;identifiant&gt;</code>.
          </span>
        </div>
      )}
    </>
  );
}
