import { LaGaufreV2 } from "@gouvfr-lasuite/ui-components";
import { useEffect, useState } from "react";
import { DOCS_ORIGIN, DOTS_ORIGIN, DRIVE_ORIGIN, LASUITE_SERVICES_API_URL } from "../../config";

const LASUITE_INTEGRATION_ORIGIN = "https://integration.lasuite.numerique.gouv.fr";
const LASUITE_GAUFRE_HTML_URL = `${LASUITE_INTEGRATION_ORIGIN}/api/v1/gaufre`;
const DOTS_LOGO_URL = `${DOTS_ORIGIN}/logo.svg`;

type RemoteService = {
  id?: string;
  name?: string;
  url?: string;
  maturity?: string;
  logo?: string;
};

type GaufreService = {
  id?: string;
  name: string;
  url: string;
  maturity?: string;
  logo?: string;
};

type ServiceAsset = {
  logo?: string;
  maturity?: string;
};

function isRemoteService(value: unknown): value is RemoteService {
  if (!value || typeof value !== "object") return false;
  const service = value as RemoteService;
  return typeof service.name === "string" && typeof service.url === "string";
}

function fallbackServices(): GaufreService[] {
  const services = [
    withLogo({ id: "docs", name: "Docs", url: DOCS_ORIGIN }),
    withLogo({ id: "dots", name: "Dots", url: DOTS_ORIGIN }),
  ];

  if (DRIVE_ORIGIN) {
    services.push(withLogo({ id: "drive", name: "Drive", url: DRIVE_ORIGIN }));
  }

  return services;
}

function serviceLogo(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<rect width="40" height="40" rx="8" fill="#eef2ff"/>
<text x="20" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#000091">${initials}</text>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function withLogo(service: GaufreService): GaufreService {
  return { ...service, logo: service.logo || serviceLogo(service.name) };
}

function normalizeService(service: RemoteService, assets: Map<string, ServiceAsset>): GaufreService {
  const id = service.id;
  const asset = id ? assets.get(id) : undefined;
  const normalized = {
    id,
    name: service.name ?? "",
    url: service.url ?? "",
    maturity: service.maturity ?? asset?.maturity,
    logo: service.logo ?? asset?.logo,
  };

  if (service.id === "docs" || service.name === "Docs") {
    return withLogo({ ...normalized, name: "Docs", url: DOCS_ORIGIN });
  }

  if (service.id === "dots" || service.name === "Dots") {
    return withLogo({ ...normalized, name: "Dots", url: DOTS_ORIGIN, logo: DOTS_LOGO_URL });
  }

  return withLogo(normalized);
}

function withDotsService(services: GaufreService[]): GaufreService[] {
  const hasDots = services.some(
    (service) => service.id === "dots" || service.name.toLowerCase() === "dots",
  );
  if (hasDots) return services;
  return [...services, withLogo({ id: "dots", name: "Dots", url: DOTS_ORIGIN, logo: DOTS_LOGO_URL })];
}

async function fetchOfficialAssets(signal: AbortSignal): Promise<Map<string, ServiceAsset>> {
  const response = await fetch(LASUITE_GAUFRE_HTML_URL, {
    headers: { Accept: "text/html" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`La Suite waffle request failed (${response.status})`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const assets = new Map<string, ServiceAsset>();

  doc.querySelectorAll<HTMLElement>(".lagaufre-service").forEach((item) => {
    const link = item.querySelector<HTMLAnchorElement>("a[data-gaufre-service-id]");
    const image = item.querySelector<HTMLImageElement>("img");
    const id = link?.dataset.gaufreServiceId;

    if (!id || !image?.getAttribute("src")) return;

    assets.set(id, {
      logo: new URL(image.getAttribute("src")!, LASUITE_INTEGRATION_ORIGIN).href,
      maturity: item.querySelector(".lagaufre-service__beta") ? "beta" : undefined,
    });
  });

  return assets;
}

async function fetchOfficialServices(signal: AbortSignal): Promise<GaufreService[]> {
  const assets = await fetchOfficialAssets(signal).catch(() => new Map<string, ServiceAsset>());
  const response = await fetch(LASUITE_SERVICES_API_URL, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`La Suite services request failed (${response.status})`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("La Suite services response is not an array");
  }

  const services = data.filter(isRemoteService).map((service) => normalizeService(service, assets));
  return withDotsService(services.length > 0 ? services : fallbackServices());
}

export function DotsGaufre() {
  const [services, setServices] = useState<GaufreService[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4_000);
    let active = true;

    fetchOfficialServices(controller.signal)
      .then((officialServices) => {
        if (active) {
          setServices(officialServices);
        }
      })
      .catch(() => {
        if (active) {
          setServices(fallbackServices());
        }
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  if (!services) return null;

  return (
    <LaGaufreV2
      key={services.map((service) => `${service.name}:${service.url}`).join("|")}
      data={{ services }}
      label="Services de La Suite numérique"
      closeLabel="Fermer les services"
      headerLabel="La Suite numérique"
      loadingText="Chargement des services..."
      newWindowLabelSuffix=" (nouvelle fenêtre)"
    />
  );
}
