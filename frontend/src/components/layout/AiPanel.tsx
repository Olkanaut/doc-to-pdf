import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  Alert,
  Badge,
  Button,
  Spinner,
  TextArea,
  VariantType,
} from "@gouvfr-lasuite/ui-components";
import {
  Checkmark,
  Send,
  XMark,
} from "@gouvfr-lasuite/ui-components/icons";
import {
  aiEditTemplate,
  aiTemplateFromPdf,
  type AiResult,
} from "../../api/client";
import { AiIcon } from "../AiIcon";

const SUGGESTIONS = [
  "Logo en en-tête",
  "Passer en Marianne",
  "En-tête à droite",
  "Pagination dès la page 2",
];
/** 4,5 Mo d'octets = 6 Mo de base64, la limite de backend/src/routes/ai.ts (MAX_PDF_BASE64). */
const MAX_PDF_BYTES = 4.5 * 1024 * 1024;

type Message =
  | { kind: "user"; text: string }
  | { kind: "error"; text: string }
  | {
      kind: "proposal";
      result: AiResult;
      base: string;
      status: "pending" | "applied" | "ignored";
    };

interface Props {
  open: boolean;
  /** Source courante : base des demandes et du résumé de diff. */
  source: string;
  fixtureId: string;
  templateName: string;
  onProposal: (result: AiResult) => void;
  onApply: (result: AiResult) => void;
  onDismiss: () => void;
  onClose: () => void;
}

/** « +n / −m lignes » par comparaison d'ensembles de lignes : suffit pour situer l'ampleur. */
function diffSummary(
  before: string,
  after: string,
): { added: number; removed: number } {
  const a = before.split("\n");
  const b = after.split("\n");
  const inA = new Set(a);
  const inB = new Set(b);
  return {
    added: b.filter((l) => !inA.has(l)).length,
    removed: a.filter((l) => !inB.has(l)).length,
  };
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("lecture du fichier impossible"));
    // data:application/pdf;base64,XXXX → XXXX
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export function AiPanel({
  open,
  source,
  fixtureId,
  templateName,
  onProposal,
  onApply,
  onDismiss,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  /** Message d'indisponibilité renvoyé par le backend (clé API absente), null sinon. */
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, busy]);

  const pending = messages.some(
    (m) => m.kind === "proposal" && m.status === "pending",
  );
  const locked = busy || unavailable !== null || pending;

  // Fermer le panneau avec une proposition en attente l'ignore : sinon l'éditeur resterait
  // verrouillé, les boutons Appliquer / Ignorer étant cachés avec le panneau.
  useEffect(() => {
    if (open || !pending) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === "proposal" && m.status === "pending"
          ? { ...m, status: "ignored" as const }
          : m,
      ),
    );
    onDismiss();
  }, [open, pending, onDismiss]);

  function push(m: Message) {
    setMessages((prev) => [...prev, m]);
  }

  async function run(
    userText: string,
    call: () => Promise<Awaited<ReturnType<typeof aiEditTemplate>>>,
  ) {
    push({ kind: "user", text: userText });
    setBusy(true);
    try {
      const r = await call();
      if (r.ok) {
        push({ kind: "proposal", result: r, base: source, status: "pending" });
        onProposal(r);
      } else if (r.unavailable) {
        setUnavailable(r.error);
      } else {
        push({ kind: "error", text: r.error });
      }
    } catch (e) {
      push({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function send() {
    const instruction = input.trim();
    if (!instruction || locked) return;
    setInput("");
    void run(instruction, () =>
      aiEditTemplate({
        source,
        instruction,
        fixtureId: fixtureId || undefined,
      }),
    );
  }

  /** Le champ est une zone de texte : Entrée envoie, Maj+Entrée passe à la ligne. */
  function onInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function sendPdf(file: File | undefined) {
    if (!file || locked) return;
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      push({ kind: "error", text: "Seul un fichier PDF est accepté." });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      push({
        kind: "error",
        text: `PDF trop volumineux (${(file.size / 1048576).toFixed(1)} Mo, maximum 4,5 Mo).`,
      });
      return;
    }
    const pdfBase64 = await readAsBase64(file);
    void run(`PDF de référence : ${file.name}`, () =>
      aiTemplateFromPdf({ pdfBase64, name: templateName }),
    );
  }

  function settle(index: number, status: "applied" | "ignored") {
    const m = messages[index];
    if (m.kind !== "proposal") return;
    setMessages((prev) =>
      prev.map((x, i) =>
        i === index && x.kind === "proposal" ? { ...x, status } : x,
      ),
    );
    if (status === "applied") onApply(m.result);
    else onDismiss();
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void sendPdf(e.dataTransfer.files[0]);
  }

  return (
    <aside className="le-ai" aria-label="Assistant IA" hidden={!open}>
      <div className="le-ai__header">
        <AiIcon size={18} aria-hidden="true" />
        Assistant IA
        <Button
          variant="tertiary"
          color="neutral"
          size="small"
          icon={<XMark aria-hidden="true" />}
          aria-label="Fermer l'assistant"
          onClick={onClose}
        />
      </div>

      <div className="le-ai__thread" ref={threadRef}>
        {messages.length === 0 && !busy && (
          <p className="le-hint le-ai__empty">
            Décrivez la modification souhaitée : l'assistant réécrit la template
            et l'aperçu montre le résultat avant d'appliquer.
          </p>
        )}
        {messages.map((m, i) => {
          if (m.kind === "user")
            return (
              <div key={i} className="ai-msg--user">
                {m.text}
              </div>
            );
          if (m.kind === "error") {
            return (
              <div key={i} role="alert">
                <Alert type={VariantType.ERROR}>{m.text}</Alert>
              </div>
            );
          }
          return (
            <ProposalCard
              key={i}
              message={m}
              onApply={() => settle(i, "applied")}
              onIgnore={() => settle(i, "ignored")}
            />
          );
        })}
        {busy && (
          <div className="le-hint le-ai__busy" role="status">
            <Spinner size="sm" />
            L'assistant réfléchit…
          </div>
        )}
      </div>

      {unavailable && (
        <div className="le-ai__notice" role="status">
          <Alert type={VariantType.WARNING}>
            Assistant indisponible : {unavailable}
          </Alert>
        </div>
      )}

      <div className="le-ai__chips">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            variant="bordered"
            color="neutral"
            size="small"
            disabled={locked}
            onClick={() => setInput(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {/* Zone de dépôt maison : le FileUploader du kit gère une liste de fichiers, ici un seul PDF part aussitôt. */}
      <div
        className={`le-ai__drop${dragOver ? " le-ai__drop--active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!locked) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !locked && fileRef.current?.click()}
      >
        Déposez un PDF de référence (charte, en-tête) : l'assistant en déduit le
        template Typst.
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          aria-label="PDF de référence"
          disabled={locked}
          onChange={(e) => {
            void sendPdf(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <form
        className="le-ai__input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <TextArea
          variant="classic"
          hideLabel
          label="Demande à l'assistant"
          placeholder="Demandez une modification…"
          rows={2}
          fullWidth
          value={input}
          disabled={locked}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <Button
          type="submit"
          variant="primary"
          icon={<Send aria-hidden="true" />}
          aria-label="Envoyer"
          disabled={locked || input.trim() === ""}
        />
      </form>
    </aside>
  );
}

function ProposalCard({
  message,
  onApply,
  onIgnore,
}: {
  message: Extract<Message, { kind: "proposal" }>;
  onApply: () => void;
  onIgnore: () => void;
}) {
  const { result, base, status } = message;
  const diff = diffSummary(base, result.source);
  const n = result.changes.length;
  return (
    <div className="ai-card">
      <div className="ai-card__title">
        <AiIcon size={16} aria-hidden="true" />
        {n} modification{n > 1 ? "s" : ""} proposée{n > 1 ? "s" : ""}
      </div>
      {result.summary && <p className="ai-card__summary">{result.summary}</p>}
      {n > 0 && (
        <ul>
          {result.changes.map((c, i) => (
            <li key={i}>
              <Checkmark size={14} aria-hidden="true" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
      {result.check.ok ? (
        <div className="le-hint">
          <span className="le-ok">
            Compilé en {result.check.ms} ms · {result.check.pages} page
            {result.check.pages > 1 ? "s" : ""}
          </span>
          {result.check.warnings.length > 0 && (
            <ul className="le-mono">
              {result.check.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Alert type={VariantType.ERROR}>
          <span>
            La proposition ne compile pas : {result.check.error}
            {result.check.details && (
              <pre className="le-mono">{result.check.details}</pre>
            )}
          </span>
        </Alert>
      )}
      <span className="le-hint">
        +{diff.added} / −{diff.removed} ligne
        {diff.added + diff.removed > 1 ? "s" : ""}
      </span>
      {status === "pending" ? (
        <>
          <div className="ai-card__actions">
            <Button
              variant="primary"
              size="small"
              icon={<Checkmark aria-hidden="true" />}
              onClick={onApply}
            >
              Appliquer
            </Button>
            <Button
              variant="secondary"
              color="neutral"
              size="small"
              onClick={onIgnore}
            >
              Ignorer
            </Button>
          </div>
          <span className="le-hint">
            L'aperçu montre déjà la proposition. Rien n'est enregistré tant que
            vous n'appliquez pas.
          </span>
        </>
      ) : (
        <Badge type="neutral" className="ai-card__status">
          {status === "applied" ? "Appliquée" : "Ignorée"}
        </Badge>
      )}
    </div>
  );
}
