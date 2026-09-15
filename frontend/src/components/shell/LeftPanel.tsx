import { Button, DropdownMenu, type ButtonElement, type DropdownMenuItem } from "@gouvfr-lasuite/ui-components";
import { ArrowDropDown, Doc, House, Plus, StackTemplate, Upload } from "@gouvfr-lasuite/ui-components/icons";
import { useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { createTemplate } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ImportTemplateModal } from "../templates/ImportTemplateModal";

/**
 * Contenu du panneau gauche (MainLayout du kit) : création (bouton scindé), accueil,
 * navigation. Sur /login (non authentifié) : rien — seule la marque de l'en-tête reste.
 * La modale d'import est ouverte par l'état `importOpen`, comme avant le recâblage.
 */
export function LeftPanel() {
  const { authenticated } = useAuth();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);

  if (!authenticated) return null;

  return (
    <>
      <div className="dots-panel__actions">
        <NewTemplateButton onImport={() => setImportOpen(true)} />
        <Button
          variant="tertiary"
          color="brand"
          aria-label="Accueil"
          icon={<House aria-hidden="true" />}
          onClick={() => navigate("/templates")}
        />
      </div>

      <nav className="dots-panel__nav" aria-label="Navigation principale">
        <NavLink to="/templates" className="dots-nav-item">
          <StackTemplate aria-hidden="true" size={20} />
          Gabarits
        </NavLink>
        <NavLink to="/documents/new" className="dots-nav-item">
          <Doc aria-hidden="true" size={20} />
          Documents
        </NavLink>
      </nav>

      {importOpen && <ImportTemplateModal onClose={() => setImportOpen(false)} />}
    </>
  );
}

/** Bouton scindé façon NewDocButton de Docs : action principale + menu (kit DropdownMenu). */
function NewTemplateButton({ onImport }: { onImport: () => void }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const moreRef = useRef<ButtonElement>(null);

  async function handleCreate() {
    setBusy(true);
    try {
      const created = await createTemplate({ name: "Nouveau gabarit", description: "" });
      navigate(`/templates/${created.id}/layout`);
    } catch (e) {
      window.alert(`Création impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const options: DropdownMenuItem[] = [
    {
      label: "Importer un .typ",
      icon: <Upload aria-hidden="true" />,
      callback: () => {
        // Une fois le menu refermé, le chevron reprend le focus : c'est lui que la modale
        // refocalisera à sa fermeture (ImportTemplateModal lit document.activeElement).
        requestAnimationFrame(() => {
          moreRef.current?.focus();
          onImport();
        });
      },
    },
  ];

  return (
    <div className="dots-split">
      <Button
        color="brand"
        className="dots-split__main"
        disabled={busy}
        onClick={handleCreate}
        icon={<Plus aria-hidden="true" />}
      >
        Nouveau gabarit
      </Button>
      <DropdownMenu options={options} isOpen={menuOpen} onOpenChange={setMenuOpen}>
        <Button
          ref={moreRef}
          color="brand"
          className="dots-split__more"
          aria-label="Autres façons de créer un gabarit"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          icon={<ArrowDropDown aria-hidden="true" />}
          onClick={() => setMenuOpen((v) => !v)}
        />
      </DropdownMenu>
    </div>
  );
}
