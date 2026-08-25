// Puerto de docs/design/frontend-prototype/src/icons.jsx (set de iconos
// propio, sin dependencia externa). Convencion de nombres: prefijo "I" +
// PascalCase (IHelp, ILogOut, ...). Todos heredan el color via currentColor,
// asi que no hay color hardcodeado: lo define quien los usa.
import type { ReactNode } from "react";

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}

function Icon({
  d,
  size = 18,
  className = "",
  strokeWidth = 1.75,
  fill = "none",
}: IconProps & { d: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {d}
    </svg>
  );
}

export const IActivity = (p: IconProps) => (
  <Icon {...p} d={<polyline points="3 12 7 12 10 4 14 20 17 12 21 12" />} />
);

export const IHistory = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <polyline points="3 4 3 9 8 9" />
        <path d="M12 8v4l3 2" />
      </>
    }
  />
);

export const IHelp = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8" />
        <circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" />
      </>
    }
  />
);

export const IClipboard = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect x="6" y="4" width="12" height="17" rx="2" />
        <path d="M9 4h6v3H9z" />
        <path d="M9 11h6M9 15h4" />
      </>
    }
  />
);

export const IAtom = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <ellipse cx="12" cy="12" rx="10" ry="4" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
      </>
    }
  />
);

export const IDownload = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M12 4v12" />
        <polyline points="7 11 12 16 17 11" />
        <path d="M4 20h16" />
      </>
    }
  />
);

export const ILogOut = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="10" y2="12" />
      </>
    }
  />
);

export const ICheck = (p: IconProps) => (
  <Icon {...p} d={<polyline points="4 12 10 18 20 6" />} />
);

export const IX = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </>
    }
  />
);

export const IChevronR = (p: IconProps) => (
  <Icon {...p} d={<polyline points="9 6 15 12 9 18" />} />
);

export const IChevronL = (p: IconProps) => (
  <Icon {...p} d={<polyline points="15 6 9 12 15 18" />} />
);

export const ISearch = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="11" cy="11" r="7" />
        <line x1="20" y1="20" x2="16.5" y2="16.5" />
      </>
    }
  />
);

export const ICalendar = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <line x1="3.5" y1="10" x2="20.5" y2="10" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
      </>
    }
  />
);

export const IFilter = (p: IconProps) => (
  <Icon {...p} d={<polygon points="3 5 21 5 14 13 14 19 10 21 10 13 3 5" />} />
);

export const IPlay = (p: IconProps) => (
  <Icon
    {...p}
    d={<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />}
  />
);

export const IPause = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
        <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
      </>
    }
  />
);

export const IAlert = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M12 3 2 21h20L12 3z" />
        <line x1="12" y1="10" x2="12" y2="14" />
        <circle cx="12" cy="17.5" r=".6" fill="currentColor" stroke="none" />
      </>
    }
  />
);

export const ICircle = (p: IconProps) => (
  <Icon {...p} d={<circle cx="12" cy="12" r="9" />} />
);

export const IInfo = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="11" x2="12" y2="16.5" />
        <circle cx="12" cy="8" r=".6" fill="currentColor" stroke="none" />
      </>
    }
  />
);

export const IGlobe = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </>
    }
  />
);

export const IHexagon = (p: IconProps) => (
  <Icon {...p} d={<polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />} />
);

export const IShield = (p: IconProps) => (
  <Icon {...p} d={<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />} />
);

export const IBolt = (p: IconProps) => (
  <Icon {...p} d={<polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2" />} />
);
