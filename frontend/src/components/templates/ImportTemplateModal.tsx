import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  checkTemplateSource,
  createTemplate,
  fetchFixtures,
  setDefaultTemplate,
  type CheckFailure,
  type CheckResult,
} from "../../api/client";
import { IconCheck, IconClose, IconFile, IconUpload, IconWarn } from "../shell/icons";
import "./templates-page.css";

const MAX_BYTES = 1024 * 1024;
/** Document d'exemple de la compilation de test (même valeur que backend/src/layout/check.ts). */
const CHECK_FIXTURE = "simple-note";

function ko(bytes: number): string {
  return (bytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** Import d'un .typ : lecture locale, compilation de test, création du gabarit. */
export function ImportTemplateModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | CheckFailure | null>(null);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fixtureName, setFixtureName] = useState(CHECK_FIXTURE);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Numéro de la lecture en cours : un fichier remplacé pendant sa compilation est ignoré.
  const run = useRef(0);

  // Focus dans la modale à l'ouverture, rendu à l'élément déclencheur à la fermeture.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    fetchFixtures()
      .then((all) => setFixtureName(all.find((f) => f.id === CHECK_FIXTURE)?.name ?? CHECK_FIXTURE))
      .catch(() => setFixtureName(CHECK_FIXTURE));
  }, []);

  // Tab boucle entre le premier et le dernier élément focalisable de la modale.
  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && active === last) {
      first.focus();
      e.preventDefault();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function choose(f: File) {
    run.current += 1;
    const id = run.current;
    setCheck(null);
    setFileError(null);
    setImportError(null);
    if (!/\.typ$/i.test(f.name)) {
      setFile(null);
      setFileError("Seuls les fichiers .typ sont acceptés.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setFileError(`Fichier trop volumineux (${ko(f.size)} Ko) : 1 Mo max.`);
      return;
    }
    setFile(f);
    setName(f.name.replace(/\.typ$/i, ""));
    setChecking(true);
    let result: CheckResult | CheckFailure;
    try {
      const text = await f.text();
      if (id !== run.current) return;
      setSource(text);
      const r = await checkTemplateSource({ source: text, fixtureId: CHECK_FIXTURE });
      // Route absente (404) : le JSON n'a pas de `ok`, on le lit comme un échec.
      result = r.ok ? r : { ok: false, error: r.error ?? "réponse inattendue du serveur", details: r.details };
    } catch (e) {
      result = { ok: false, error: `Compilation de test indisponible : ${(e as Error).message}` };
    }
    if (id !== run.current) return;
    setCheck(result);
    setChecking(false);
  }

  function remove() {
    run.current += 1;
    setFile(null);
    setSource("");
    setName("");
    setCheck(null);
    setChecking(false);
    setFileError(null);
    setImportError(null);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void choose(f);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void choose(f);
  }

  async function handleImport() {
    if (!file || !check?.ok) return;
    setImporting(true);
    setImportError(null);
    try {
      const created = await createTemplate({
        name: name.trim(),
        description: `Importé depuis ${file.name}`,
        source,
      });
      if (makeDefault) {
        try {
          await setDefaultTemplate(created.id);
        } catch (e) {
          window.alert(`Gabarit importé, mais non défini par défaut : ${(e as Error).message}`);
        }
      }
      onClose();
      navigate(`/t/${created.id}/layout`);
    } catch (e) {
      setImportError((e as Error).message);
      setImporting(false);
    }
  }

  // Portail vers <body> : montée dans le panneau gauche (position: sticky, donc
  // contexte d'empilement propre), la modale passerait sous les tuiles de la liste.
  return createPortal(
    <div
      className="dots-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dots-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-template-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <div className="dots-modal__header">
          <h3 id="import-template-title">Importer un gabarit Typst</h3>
          <button type="button" className="dots-btn dots-btn--icon" aria-label="Fermer" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        {file ? (
          <div className="import-file">
            <IconFile />
            <span className="import-file__name">{file.name}</span>
            <span className="dots-muted">{ko(file.size)} Ko</span>
            <button
              type="button"
              className="dots-btn dots-btn--icon"
              aria-label="Retirer le fichier"
              onClick={remove}
            >
              <IconClose size={18} />
            </button>
          </div>
        ) : (
          <label
            className={"dots-dropzone" + (dragging ? " dots-dropzone--active" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <IconUpload />
            <span>Déposez un fichier .typ ou cliquez pour parcourir</span>
            <span>1 Mo max · un seul fichier</span>
            <input className="import-input" type="file" accept=".typ,text/plain" onChange={onInputChange} />
          </label>
        )}

        {fileError && (
          <div className="dots-notice dots-notice--error" role="alert">
            {fileError}
          </div>
        )}
        {checking && <p className="dots-muted">Compilation de test en cours…</p>}
        {check &&
          (check.ok ? (
            <div className="dots-notice import-result">
              <IconCheck className="dots-ok" />
              <div className="import-result__body">
                <span>
                  <strong className="dots-ok">Compilation de test réussie</strong> — {check.ms} ms,{" "}
                  {check.pages} {check.pages > 1 ? "pages" : "page"}
                </span>
                {check.warnings.map((w, i) => (
                  <span key={i} className="import-result__line dots-mono">
                    <IconWarn size={16} />
                    {w}
                  </span>
                ))}
                <span className="dots-muted">Test effectué sur le document d'exemple « {fixtureName} ».</span>
              </div>
            </div>
          ) : (
            <div className="dots-notice dots-notice--error import-result" role="alert">
              <IconWarn />
              <div className="import-result__body">
                <span>{check.error}</span>
                {check.details && <pre className="dots-mono">{check.details}</pre>}
              </div>
            </div>
          ))}

        <label className="dots-field">
          <span>Nom du gabarit</span>
          <input className="dots-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="import-checkbox">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          Définir comme gabarit par défaut
        </label>

        {importError && (
          <div className="dots-notice dots-notice--error" role="alert">
            {importError}
          </div>
        )}

        <div className="dots-modal__footer">
          <button type="button" className="dots-btn" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="dots-btn dots-btn--brand"
            disabled={!check?.ok || name.trim() === "" || importing}
            onClick={handleImport}
          >
            <IconUpload size={18} />
            Importer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
