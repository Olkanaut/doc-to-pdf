import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface OpenTargetProps {
  id: string;
  /** Real navigation: renders as a Link. Takes priority over onOpen if both are given. */
  href?: string;
  /** Inline-picker mode: renders as a plain button. Ignored when href is set. */
  onOpen?: (id: string) => void;
  className: string;
  children: ReactNode;
}

/**
 * The one piece of "should this navigate or just notify the caller" logic,
 * shared so every template view (grid, list, and future ones) stays usable
 * both as a real page (/templates, with real links) and as an embedded
 * picker elsewhere (a callback, no navigation).
 */
export function OpenTarget({ id, href, onOpen, className, children }: OpenTargetProps) {
  if (href) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={() => onOpen?.(id)}>
      {children}
    </button>
  );
}
