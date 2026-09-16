import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { createTemplate } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ImportTemplateModal } from "../templates/ImportTemplateModal";
import { IconChevronDown, IconDoc, IconHome, IconLayout, IconUser } from "./icons";
import "../templates/templates-page.css";

/** Panneau gauche façon Docs : marque, création, navigation, utilisateur. */
export function LeftPanel() {
  const { authenticated, user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menu du bouton scindé : focus sur la première entrée à l'ouverture, flèches
  // entre les entrées ; fermé au clic ailleurs, à Tab, et à Échap (qui rend le
  // focus au chevron).
  useEffect(() => {
    if (!menuOpen) return;
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    items()[0]?.focus();
    function onDown(e: MouseEvent) {
      if (!splitRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Tab") setMenuOpen(false);
      if (e.key === "Escape") {
        setMenuOpen(false);
        moreRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
        e.preventDefault();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleCreate() {
    setBusy(true);
    try {
      const created = await createTemplate({ name: "Nouveau gabarit", description: "" });
      navigate(`/t/${created.id}/layout`);
    } catch (e) {
      window.alert(`Création impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="dots-left-panel">
      <div className="dots-left-panel__header">
        <Link to="/" className="dots-left-panel__brand">
          <span className="dots-left-panel__logo" aria-hidden="true">
            dt
          </span>
          <span className="dots-left-panel__title">dots</span>
        </Link>
      </div>

      {/* Sur /login (non authentifié) : ni création ni navigation, seule la marque. */}
      {authenticated && (
        <>
          <div className="dots-left-panel__actions">
            <Link to="/" className="dots-btn dots-btn--icon" aria-label="Accueil">
              <IconHome />
            </Link>
            <div className="dots-split" ref={splitRef}>
              <button
                type="button"
                className="dots-btn dots-btn--brand dots-split__main"
                disabled={busy}
                onClick={handleCreate}
              >
                Nouveau gabarit
              </button>
              <button
                type="button"
                className="dots-btn dots-btn--brand dots-split__more"
                aria-label="Autres façons de créer un gabarit"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                ref={moreRef}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <IconChevronDown size={18} />
              </button>
              {menuOpen && (
                <div className="dots-menu" role="menu" ref={menuRef}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      // Le chevron reprend le focus avant l'ouverture : c'est lui que
                      // la modale refocalisera à sa fermeture.
                      moreRef.current?.focus();
                      setMenuOpen(false);
                      setImportOpen(true);
                    }}
                  >
                    Importer un .typ
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className="dots-left-panel__nav" aria-label="Navigation principale">
            <NavLink to="/" className="dots-nav-item">
              <IconLayout size={18} />
              Gabarits
            </NavLink>
            <NavLink to="/docs" className="dots-nav-item">
              <IconDoc size={18} />
              Documents
            </NavLink>
          </nav>
        </>
      )}

      <div className="dots-left-panel__footer">
        <span className="dots-avatar" aria-hidden="true">
          <IconUser size={18} />
        </span>
        <span>{user?.name ?? "Invité"}</span>
      </div>

      {importOpen && <ImportTemplateModal onClose={() => setImportOpen(false)} />}
    </aside>
  );
}
