// Picture-first product art (from the approved design) and simple line icons.
import type { ReactNode } from "react";

export function ProductArt({ kind, size = 56 }: { kind: string; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 48 48", "aria-hidden": true } as const;
  switch (kind) {
    case "dal":
      return (<svg {...s}><path d="M8 22c0 10 7 17 16 17s16-7 16-17" fill="#fff" stroke="#9A6512" strokeWidth="2" /><ellipse cx="24" cy="22" rx="16" ry="5" fill="#F2B33D" stroke="#9A6512" strokeWidth="2" /><circle cx="18" cy="21" r="1.6" fill="#9A6512" /><circle cx="25" cy="20" r="1.6" fill="#9A6512" /><circle cx="31" cy="22" r="1.6" fill="#9A6512" /></svg>);
    case "oil":
      return (<svg {...s}><path d="M20 7h8v5l4 5v23a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V17l4-5z" fill="#FFD84D" stroke="#9A7A06" strokeWidth="2" strokeLinejoin="round" /><rect x="19" y="24" width="10" height="9" rx="1.5" fill="#fff" stroke="#9A7A06" strokeWidth="1.5" /><path d="M19.5 6h9" stroke="#9A7A06" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "sugar":
      return (<svg {...s}><path d="M12 12h24l2 28H10z" fill="#fff" stroke="#5A6B85" strokeWidth="2" strokeLinejoin="round" /><path d="M12 12l3-5h18l3 5" fill="#DDE4EE" stroke="#5A6B85" strokeWidth="2" strokeLinejoin="round" /><rect x="17" y="21" width="7" height="7" rx="1" fill="#DDE4EE" stroke="#5A6B85" strokeWidth="1.5" /><rect x="24" y="27" width="7" height="7" rx="1" fill="#DDE4EE" stroke="#5A6B85" strokeWidth="1.5" /></svg>);
    case "flour":
      return (<svg {...s}><rect x="11" y="10" width="26" height="31" rx="3" fill="#F6E2C4" stroke="#8C5A22" strokeWidth="2" /><path d="M24 36V18M24 22l-4-3M24 22l4-3M24 28l-4-3M24 28l4-3" stroke="#8C5A22" strokeWidth="2" strokeLinecap="round" /></svg>);
    case "salt":
      return (<svg {...s}><path d="M16 18c0-6 4-10 8-10s8 4 8 10v20a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3z" fill="#fff" stroke="#2E6B4A" strokeWidth="2" /><path d="M16 19h16" stroke="#2E6B4A" strokeWidth="2" /><circle cx="21" cy="13" r="1.3" fill="#2E6B4A" /><circle cx="24" cy="11" r="1.3" fill="#2E6B4A" /><circle cx="27" cy="13" r="1.3" fill="#2E6B4A" /></svg>);
    case "all":
      return (<svg {...s}><rect x="9" y="9" width="13" height="13" rx="3" fill="#fff" stroke="#1E7B3A" strokeWidth="2" /><rect x="26" y="9" width="13" height="13" rx="3" fill="#F6B21B" stroke="#1E7B3A" strokeWidth="2" /><rect x="9" y="26" width="13" height="13" rx="3" fill="#F6B21B" stroke="#1E7B3A" strokeWidth="2" /><rect x="26" y="26" width="13" height="13" rx="3" fill="#fff" stroke="#1E7B3A" strokeWidth="2" /></svg>);
    default:
      return (<svg {...s}><path d="M17 7h14l-3 6c6 3 11 10 11 18 0 7-6 11-15 11S9 38 9 31c0-8 5-15 11-18z" fill="#F3E3BF" stroke="#8A6A2E" strokeWidth="2" strokeLinejoin="round" /><path d="M19 13h10" stroke="#8A6A2E" strokeWidth="2" strokeLinecap="round" /><circle cx="20" cy="30" r="1.6" fill="#8A6A2E" /><circle cx="26" cy="27" r="1.6" fill="#8A6A2E" /><circle cx="28" cy="33" r="1.6" fill="#8A6A2E" /><circle cx="22" cy="36" r="1.6" fill="#8A6A2E" /></svg>);
  }
}

function Line({ children, size = 24, stroke = "currentColor", width = 2.2 }: { children: ReactNode; size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number; stroke?: string };
export const IconBack = (p: P) => <Line {...p} width={2.4}><path d="M15 5l-7 7 7 7" /></Line>;
export const IconNext = (p: P) => <Line {...p} width={2.4}><path d="M9 5l7 7-7 7" /></Line>;
export const IconCheck = (p: P) => <Line {...p} width={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></Line>;
export const IconSearch = (p: P) => <Line {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></Line>;
export const IconTruck = (p: P) => <Line {...p}><path d="M2 6h11v10H2zM13 10h4l3 3v3h-7z" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></Line>;
export const IconHome = (p: P) => <Line {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Line>;
export const IconList = (p: P) => <Line {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></Line>;
export const IconBasket = (p: P) => <Line {...p}><path d="M3 9h18l-2 10a2 2 0 0 1-2 1.6H7A2 2 0 0 1 5 19z" /><path d="M8 9l4-6 4 6" /></Line>;
export const IconHelp = (p: P) => <Line {...p}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></Line>;
export const IconPin = (p: P) => <Line {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Line>;
export const IconCalendar = (p: P) => <Line {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Line>;
export const IconLock = (p: P) => <Line {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Line>;
export const IconPhone = (p: P) => <Line {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></Line>;
export const IconChat = (p: P) => <Line {...p}><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" /></Line>;
export const IconAlert = (p: P) => <Line {...p}><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Line>;
export const IconUser = (p: P) => <Line {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Line>;
export const IconShield = (p: P) => <Line {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></Line>;
export const IconRupee = (p: P) => <Line {...p}><path d="M7 4h10M7 9h10M7 4c5 0 6 5 0 5l8 11" /></Line>;
export const IconStar = ({ size = 16, fill = "currentColor" }: { size?: number; fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>
);

export function Logo({ size = 52 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: "#F6B21B", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" aria-hidden="true"><path d="M5 12h22l-2.5 13a2 2 0 0 1-2 1.6H9.5a2 2 0 0 1-2-1.6z" fill="#fff" stroke="#1D2A1F" strokeWidth="2" strokeLinejoin="round" /><path d="M11 12l4-7M21 12l-4-7" stroke="#1D2A1F" strokeWidth="2" strokeLinecap="round" /><path d="M12 17v5M16 17v5M20 17v5" stroke="#1E7B3A" strokeWidth="2" strokeLinecap="round" /></svg>
    </div>
  );
}
