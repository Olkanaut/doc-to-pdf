import { useId, type CSSProperties, type SVGProps } from "react";

type AiIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  variant?: "flat" | "action";
  color?: CSSProperties["color"];
};

export function AiIcon({
  size = 18,
  variant = "flat",
  color,
  style,
  ...props
}: AiIconProps) {
  const rawId = useId().replace(/:/g, "");
  const gradientId = `ai-icon-gradient-${rawId}`;
  const isAction = variant === "action";
  const fill = isAction ? `url(#${gradientId})` : "currentColor";
  const iconStyle = {
    color: color ?? (isAction ? undefined : "var(--dots-primary)"),
    ...style,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 99 104"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={iconStyle}
      {...props}
    >
      {isAction && (
        <>
          <defs>
            <linearGradient
              id={gradientId}
              x1="12"
              y1="91"
              x2="91"
              y2="15"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--dots-primary)" />
              <stop offset="45%" stopColor="#00A6D6" />
              <stop offset="100%" stopColor="#8F5BFF" />
            </linearGradient>
          </defs>
          <style>
            {`
              .ai-icon__star-main {
                animation: ai-icon-star-main 2.9s ease-in-out infinite;
                transform-box: fill-box;
                transform-origin: center;
              }
              .ai-icon__star-small {
                animation: ai-icon-star-small 2.9s ease-in-out infinite;
                animation-delay: 0.55s;
                transform-box: fill-box;
                transform-origin: center;
              }
              @keyframes ai-icon-star-main {
                0% { transform: translate(-2px, 12px) scale(0.72); opacity: 0; }
                14% { opacity: 0; }
                24% { opacity: 0.95; }
                76% { transform: translate(2px, -10px) scale(1.08); opacity: 0.95; }
                100% { transform: translate(4px, -18px) scale(0.86); opacity: 0; }
              }
              @keyframes ai-icon-star-small {
                0% { transform: translate(2px, 10px) scale(0.68); opacity: 0; }
                12% { opacity: 0; }
                24% { opacity: 0.9; }
                72% { transform: translate(-2px, -8px) scale(1.12); opacity: 0.9; }
                100% { transform: translate(-4px, -16px) scale(0.78); opacity: 0; }
              }
              @media (prefers-reduced-motion: reduce) {
                .ai-icon__star-main,
                .ai-icon__star-small {
                  animation: none;
                }
              }
            `}
          </style>
        </>
      )}
      <path
        d="M73.398 50.8984C66.898 53.6992 64.4996 56.2968 61.597 63.2964C58.597 55.898 56.097 53.4956 48.699 50.3984C54.9998 47.7968 57.699 45.5976 60.199 40.5C54.3006 34 49.801 25.801 44.898 14C34.3 39.699 25.699 48.301 0 59C25.699 69.699 34.301 78.301 45 104C55.699 78.301 64.301 69.699 90 59C83.5 56.3008 78 53.6992 73.398 50.8984Z"
        fill={fill}
      />
      <g className={isAction ? "ai-icon__star-main" : undefined}>
        <path
          d="M82 51C86.0773 41.3114 89.3114 38.0773 99 34C89.3114 29.9227 86.0773 26.6886 82 17C77.9227 26.6886 74.6886 29.9227 65 34C74.6886 38.0773 77.9227 41.3114 82 51Z"
          fill={fill}
        />
      </g>
      <g className={isAction ? "ai-icon__star-small" : undefined}>
        <path
          d="M63 23C65.6382 16.3337 67.6235 14.2582 74 11.5C67.6235 8.74184 65.6382 6.66632 63 0C60.3618 6.66632 58.3765 8.74184 52 11.5C58.3765 14.2582 60.3618 16.3337 63 23Z"
          fill={fill}
        />
      </g>
    </svg>
  );
}
