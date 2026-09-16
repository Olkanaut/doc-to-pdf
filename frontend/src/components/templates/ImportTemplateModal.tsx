import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  FileUploader,
  Input,
  Modal,
  ModalSize,
  VariantType,
  type UploadFile,
} from "@gouvfr-lasuite/ui-components";
import { Upload, XMark } from "@gouvfr-lasuite/ui-components/icons";
import {
  checkTemplateSource,
  createTemplate,
  fetchFixtures,
  setDefaultTemplate,
  type CheckFailure,
  type CheckResult,
} from "../../api/client";
import "./templates-page.css";

const MAX_BYTES = 1024 * 1024;
/** Document d'exemple de la compilation de test (même valeur que backend/src/layout/check.ts). */
const CHECK_FIXTURE = "simple-note";
const TITLE = "Importer un gabarit Typst";

function ko(bytes: number): string {
  return (bytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/**
 * Import d'un .typ : lecture locale, compilation de test, création du gabarit.
 * Monté par LeftPanel tant que la modale est ouverte ; `onClose` la démonte.
 * `Modal` (react-modal) rend le focus à l'élément actif avant l'ouverture — le
 * chevron du bouton scindé, que LeftPanel focalise avant de monter la modale.
 */
export function ImportTemplateModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [upload, setUpload] = useState<UploadFile | null>(null);
  const [source, setSource] = useState("");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<CheckResult | CheckFailure | null>(null);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [fixtureName, setFixtureName] = useState(CHECK_FIXTURE);
  // Numéro de la lecture en cours : un fichier remplacé pendant sa compilation est ignoré.
  const run = useRef(0);

  useEffect(() => {
    fetchFixtures()
      .then((all) => setFixtureName(all.find((f) => f.id === CHECK_FIXTURE)?.name ?? CHECK_FIXTURE))
      .catch(() => setFixtureName(CHECK_FIXTURE));
  }, []);

  async function choose(next: UploadFile) {
    run.current += 1;
    const id = run.current;
    const f = next.originalFile;
    setCheck(null);
    setImportError(null);
    // Fichier refusé : il reste affiché dans la zone de dépôt, en erreur, sans nom prérempli.
    if (!/\.typ$/i.test(f.name)) {
      setUpload({ ...next, status: "error", error: "Seuls les fichiers .typ sont acceptés." });
      return;
    }
    if (f.size > MAX_BYTES) {
      setUpload({
        ...next,
        status: "error",
        error: `Fichier trop volumineux (${ko(f.size)} Ko) : 1 Mo max.`,
      });
      return;
    }
    setUpload({ ...next, status: "done" });
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
    setUpload(null);
    setSource("");
    setName("");
    setCheck(null);
    setChecking(false);
    setImportError(null);
  }

  async function handleImport() {
    if (!upload || !check?.ok) return;
    setImporting(true);
    setImportError(null);
    try {
      const created = await createTemplate({
        name: name.trim(),
        description: `Importé depuis ${upload.originalFile.name}`,
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

  const fileDescription = upload?.status === "done" ? `${ko(upload.originalFile.size)} Ko` : undefined;

  return (
    <Modal
      isOpen
      size={ModalSize.MEDIUM}
      onClose={onClose}
      closeOnClickOutside
      hideCloseButton
      // Le titre est un nœud React : sans aria-label, react-modal nommerait la
      // boîte « [object Object] » (même contournement que dans Docs).
      aria-label={TITLE}
      title={
        <>
          <h2 className="import-modal__title">{TITLE}</h2>
          <div className="import-modal__close">
            <Button
              type="button"
              size="small"
              color="neutral"
              variant="tertiary"
              aria-label="Fermer"
              icon={<XMark aria-hidden="true" />}
              onClick={onClose}
            />
          </div>
        </>
      }
      rightActions={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            icon={<Upload aria-hidden="true" />}
            disabled={!check?.ok || name.trim() === "" || importing}
            onClick={handleImport}
          >
            Importer
          </Button>
        </>
      }
    >
      <div className="import-modal__body">
        <FileUploader
          name="typ"
          accept=".typ,text/plain"
          maxSize={MAX_BYTES}
          files={upload ? [upload] : []}
          onAddFiles={(files) => {
            if (files[0]) void choose(files[0]);
          }}
          onRemoveFile={remove}
          description={fileDescription}
          labels={{
            noFileYet: "Déposez un fichier .typ",
            clickToUpload: "ou cliquez pour parcourir",
            maxSize: "1 Mo max, un seul fichier",
            remove: "Retirer le fichier",
          }}
        />

        {checking && <p className="dots-muted import-modal__status">Compilation de test en cours…</p>}
        {check &&
          (check.ok ? (
            <Alert type={VariantType.SUCCESS}>
              <div className="import-result__body">
                <span>
                  <strong>Compilation de test réussie</strong> — {check.ms} ms, {check.pages}{" "}
                  {check.pages > 1 ? "pages" : "page"}
                </span>
                {check.warnings.map((w, i) => (
                  <span key={i} className="dots-mono">
                    {w}
                  </span>
                ))}
                <span className="import-result__note">
                  Test effectué sur le document d'exemple « {fixtureName} ».
                </span>
              </div>
            </Alert>
          ) : (
            // Le kit ne pose pas de rôle sur Alert : l'enveloppe porte la zone vive.
            <div role="alert">
              <Alert type={VariantType.ERROR}>
                <div className="import-result__body">
                  <span>{check.error}</span>
                  {check.details && <pre className="dots-mono">{check.details}</pre>}
                </div>
              </Alert>
            </div>
          ))}

        <Input label="Nom du gabarit" fullWidth value={name} onChange={(e) => setName(e.target.value)} />
        <Checkbox
          label="Définir comme gabarit par défaut"
          checked={makeDefault}
          onChange={(e) => setMakeDefault(e.target.checked)}
        />

        {importError && (
          <div role="alert">
            <Alert type={VariantType.ERROR}>{importError}</Alert>
          </div>
        )}
      </div>
    </Modal>
  );
}
