import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./home.css";

function extractDocumentId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const docsIndex = segments.indexOf("docs");
    if (docsIndex !== -1 && segments[docsIndex + 1]) {
      return segments[docsIndex + 1];
    }
    return segments.at(-1) ?? "";
  } catch {
    return trimmed.replace(/^\/?docs\//, "").replace(/\/$/, "");
  }
}

export function HomePage() {
  const [documentRef, setDocumentRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const documentId = extractDocumentId(documentRef);
    if (!documentId) {
      setError("Document introuvable.");
      return;
    }

    setError(null);
    const template = searchParams.get("template");
    navigate(
      `/docs/${encodeURIComponent(documentId)}${
        template ? `?template=${encodeURIComponent(template)}` : ""
      }`,
    );
  }

  return (
    <div className="home-entry" aria-label="Ouvrir un document Docs">
      <HomeLogo />
      <p className="home-entry__tagline">
        Recherchez et chargez vos documents dans vos templates PDF.
      </p>

      <form className="home-entry__form" onSubmit={handleSubmit}>
        <input
          autoFocus
          aria-label="URL ou identifiant Docs"
          value={documentRef}
          placeholder="URL ou identifiant Docs"
          onChange={(event) => setDocumentRef(event.target.value)}
        />
        <button type="submit">Ouvrir</button>
      </form>

      {error && (
        <p className="home-entry__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function HomeLogo() {
  return (
    <svg
      className="home-entry__logo"
      viewBox="0 0 2156 698"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dots"
    >
      <circle className="home-entry__logo-dot home-entry__logo-dot--1" cx="197.978" cy="500.022" r="197.978" fill="#2945C1" />
      <circle className="home-entry__logo-dot home-entry__logo-dot--2" cx="534.287" cy="95.1818" r="95.1818" fill="#2945C1" />
      <circle className="home-entry__logo-dot home-entry__logo-dot--3" cx="534.287" cy="349" r="95.1818" fill="#BA2F4D" />
      <circle className="home-entry__logo-dot home-entry__logo-dot--4" cx="534.287" cy="602.818" r="95.1818" fill="#BA2F4D" />
      <path
        className="home-entry__logo-letter home-entry__logo-letter--1"
        d="M856 553.494H1021.2C1154.57 553.494 1244.68 456.78 1244.68 343.247C1244.68 229.714 1154.57 133 1021.2 133H856V553.494ZM1022.4 210.491C1100.5 210.491 1156.97 268.159 1156.97 343.247C1156.97 417.734 1100.5 476.003 1022.4 476.003H941.305V210.491H1022.4Z"
        fill="#2945C1"
      />
      <path
        className="home-entry__logo-letter home-entry__logo-letter--2"
        d="M1462.75 238.724C1364.23 238.724 1296.94 311.41 1296.94 402.116C1296.94 492.823 1364.23 565.508 1462.75 565.508C1561.27 565.508 1628.55 492.823 1628.55 402.116C1628.55 311.41 1561.27 238.724 1462.75 238.724ZM1463.95 493.423C1413.49 493.423 1376.24 454.978 1376.24 402.116C1376.24 349.254 1413.49 310.809 1463.95 310.809C1512.61 310.809 1549.25 349.254 1549.25 402.116C1549.25 454.377 1512.61 493.423 1463.95 493.423Z"
        fill="#2945C1"
      />
      <path
        className="home-entry__logo-letter home-entry__logo-letter--3"
        d="M1713.86 442.964C1713.86 516.851 1749.9 559.501 1825.59 559.501C1850.82 559.501 1868.85 556.497 1883.87 549.89V483.211C1873.65 487.416 1859.84 489.819 1838.81 489.819C1808.77 489.819 1790.75 476.604 1790.75 442.964V319.219H1883.26V250.738H1790.75V175.049H1713.86V250.738H1657.39V319.219H1713.86V442.964Z"
        fill="#2945C1"
      />
      <path
        className="home-entry__logo-letter home-entry__logo-letter--4"
        d="M1925.32 509.642C1954.15 543.883 1992.6 565.508 2046.67 565.508C2103.74 565.508 2154.8 530.667 2156 466.992C2156 362.469 2011.22 380.491 2011.22 328.83C2011.22 313.212 2022.64 299.996 2046.67 299.996C2070.09 299.996 2089.92 315.614 2105.54 334.837L2156 290.385C2134.37 260.95 2092.32 238.724 2046.06 238.724C1982.99 238.724 1937.93 278.971 1937.93 332.434C1937.93 438.759 2082.71 418.936 2082.71 471.798C2082.71 489.819 2070.09 504.236 2045.46 504.236C2016.63 504.236 1994.4 487.416 1975.78 463.989L1925.32 509.642Z"
        fill="#2945C1"
      />
    </svg>
  );
}
