import { type MouseEventHandler, type ReactNode } from "react";

export interface SegmentedIconSwitchItem<T extends string> {
  value: T;
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
}

interface Props<T extends string> {
  ariaLabel: string;
  value: T;
  items: SegmentedIconSwitchItem<T>[];
}

export function SegmentedIconSwitch<T extends string>({ ariaLabel, value, items }: Props<T>) {
  return (
    <div className="dots-segmented-switch" role="group" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        const className = `dots-segmented-switch__item${active ? " dots-segmented-switch__item--active" : ""}`;

        if (item.href) {
          return (
            <a
              key={item.value}
              href={item.href}
              className={className}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={item.onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
            >
              {item.icon}
            </a>
          );
        }

        return (
          <button
            key={item.value}
            type="button"
            className={className}
            aria-pressed={active}
            aria-label={item.label}
            title={item.label}
            onClick={item.onClick as MouseEventHandler<HTMLButtonElement> | undefined}
          >
            {item.icon}
          </button>
        );
      })}
    </div>
  );
}
