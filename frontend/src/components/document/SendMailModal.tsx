import { useState } from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  ModalSize,
  TextArea,
  VariantType,
} from "@gouvfr-lasuite/ui-components";
import { Mail, Send } from "@gouvfr-lasuite/ui-components/icons";

interface Props {
  documentTitle: string;
  fileName: string;
  /** Faux tant que le PDF n'est pas rendu : il n'y a alors rien à joindre. */
  pdfReady: boolean;
  onClose: () => void;
}

/**
 * Envoi par e-mail — **maquette**. Les champs existent et se saisissent, mais
 * rien ne part : aucune route d'envoi n'est branchée côté serveur. Le bouton
 * « Envoyer » affiche un avis qui le dit, plutôt que de mimer un succès.
 *
 * Destinataires en saisie libre (une adresse par virgule) : pas d'annuaire ici.
 */
export function SendMailModal({ documentTitle, fileName, pdfReady, onClose }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(documentTitle);
  const [message, setMessage] = useState(
    `Bonjour,\n\nVous trouverez ci-joint « ${documentTitle} » au format PDF.`,
  );
  const [attempted, setAttempted] = useState(false);

  return (
    <Modal
      isOpen
      size={ModalSize.MEDIUM}
      onClose={onClose}
      title="Envoyer par e-mail"
      titleIcon={<Mail aria-hidden="true" />}
      rightActions={
        <>
          <Button type="button" variant="tertiary" color="neutral" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            color="brand"
            icon={<Send aria-hidden="true" />}
            disabled={!to.trim()}
            onClick={() => setAttempted(true)}
          >
            Envoyer
          </Button>
        </>
      }
    >
      <div className="doc-mail">
        <Alert type={VariantType.INFO}>
          Maquette : l'envoi n'est pas encore branché. Le PDF reste téléchargeable.
        </Alert>

        <Input
          label="Destinataires"
          labelDescription="Une ou plusieurs adresses, séparées par des virgules."
          variant="classic"
          fullWidth
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Input
          label="Objet"
          variant="classic"
          fullWidth
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <TextArea
          label="Message"
          variant="classic"
          fullWidth
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <div className="doc-mail__attach">
          <span className="doc-mail__attach-ico" aria-hidden="true">
            PDF
          </span>
          <span className="doc-mail__attach-name">{fileName}</span>
          <span className="dots-muted">
            {pdfReady ? "pièce jointe" : "en cours de génération"}
          </span>
        </div>

        {attempted && (
          <div role="status">
            <Alert type={VariantType.WARNING}>
              Rien n'a été envoyé : la route d'envoi reste à écrire.
            </Alert>
          </div>
        )}
      </div>
    </Modal>
  );
}
