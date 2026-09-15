import { useAuth } from "../auth/AuthContext";
import type { AuthUser } from "../api/client";

function userDisplayName(user: AuthUser): string {
  const fullName = [user.givenName, user.familyName].filter(Boolean).join(" ");
  return (
    (user.name ?? fullName) ||
    user.preferredUsername ||
    user.email ||
    "Utilisateur connecté"
  );
}

function userInitials(user: AuthUser): string {
  const displayName = userDisplayName(user);
  const words = displayName.split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]).join("");
  return initials.toUpperCase() || "U";
}

export function UserMenu() {
  const { authenticated, user, logout } = useAuth();

  if (!authenticated || !user) {
    return null;
  }

  return (
    <details className="app-menu user-menu">
      <summary className="user-menu-trigger" aria-label="Profil utilisateur">
        <span className="user-avatar" aria-hidden="true">
          {userInitials(user)}
        </span>
      </summary>

      <div className="app-menu-panel user-menu-panel">
        <div className="user-menu-details">
          <strong>{userDisplayName(user)}</strong>
          <span>{user.email ?? user.preferredUsername ?? user.sub}</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => void logout()}>
          Se déconnecter
        </button>
      </div>
    </details>
  );
}
