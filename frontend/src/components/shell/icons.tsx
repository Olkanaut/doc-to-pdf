// Icônes trait 24 px (currentColor), même vocabulaire que les maquettes. Pas d'emoji.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconHome = (p: P) => <Svg {...p}><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const IconBack = (p: P) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v12M6 10l6 6 6-6M4 20h16" /></Svg>;
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />
  </Svg>
);
export const IconMore = (p: P) => (
  <Svg {...p}><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></Svg>
);
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12l5 5L20 7" /></Svg>;
export const IconWarn = (p: P) => <Svg {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></Svg>;
export const IconSparkle = (p: P) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Svg>
);
export const IconCode = (p: P) => <Svg {...p}><path d="M8 6l-6 6 6 6M16 6l6 6-6 6" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconLink = (p: P) => (
  <Svg {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" /></Svg>
);
export const IconSend = (p: P) => <Svg {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></Svg>;
export const IconLayout = (p: P) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></Svg>;
export const IconDoc = (p: P) => <Svg {...p}><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M9 13h6M9 17h6" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>;
