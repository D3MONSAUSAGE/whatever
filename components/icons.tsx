export function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconImage() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M7 16.5 11 12l2.5 2.5L16 12l3.5 4.5" />
    </svg>
  );
}

export function IconTv() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
    </svg>
  );
}

export function IconList() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 7h11M9 12h11M9 17h11" />
      <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </svg>
  );
}

export function IconGear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.6l1.6 1.6M17.6 15.8l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.4l1.6-1.6M17.6 8.2l1.6-1.6" />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconChart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V7M17 16v-8" strokeLinecap="round" />
    </svg>
  );
}

/* App shell and notification center (redesign phase 1). 24-px grid, 1.8 stroke, like the icons above. */
const STROKE = { viewBox: "0 0 24 24", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function IconHome() {
  return <svg {...STROKE}><path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" /><path d="M10 20v-5h4v5" /></svg>;
}
export function IconBell() {
  return <svg {...STROKE}><path d="M6 10a6 6 0 0 1 12 0c0 4.6 1.8 6.4 1.8 6.4H4.2S6 14.6 6 10Z" /><path d="M10.2 19.5a2 2 0 0 0 3.6 0" /></svg>;
}
export function IconMore() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>;
}
export function IconSignOut() {
  return <svg {...STROKE}><path d="M10 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h4" /><path d="m15 16 4-4-4-4M19 12H9.5" /></svg>;
}
export function IconCard() {
  return <svg {...STROKE}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10.5h17" /></svg>;
}
export function IconCheck() {
  return <svg {...STROKE} strokeWidth={2.2}><path d="m6 12.5 4 4 8-9" /></svg>;
}
export function IconX() {
  return <svg {...STROKE}><path d="m6.5 6.5 11 11M17.5 6.5l-11 11" /></svg>;
}
export function IconGlobe() {
  return <svg {...STROKE}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" /></svg>;
}
export function IconHelp() {
  return <svg {...STROKE}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.8M12 16.6v.2" /></svg>;
}
export function IconBrush() {
  return <svg {...STROKE}><path d="m16.5 3.5 4 4-8 8-4-4 8-8Z" /><path d="m8.5 11.5-3.2 3.2c-1.3 1.3-1.3 3.6-1.3 5.3 1.7 0 4 0 5.3-1.3l3.2-3.2" /></svg>;
}
export function IconTvOff() {
  return <svg {...STROKE}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M8 20h8M4 4l16 16" /></svg>;
}
export function IconScreens() {
  return <svg {...STROKE}><rect x="2.5" y="5" width="11" height="8" rx="1.5" /><rect x="10.5" y="11" width="11" height="8" rx="1.5" /></svg>;
}
export function IconInfo() {
  return <svg {...STROKE}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.2" /></svg>;
}

/* Peek redesign: the few icons the handoff needs that did not exist yet (reference: handoff assets/icons). */
export function IconPlus() { return <svg {...STROKE}><path d="M12 5v14M5 12h14" /></svg>; }
export function IconWarn() { return <svg {...STROKE}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>; }
export function IconBack() { return <svg {...STROKE}><path d="M15 18l-6-6 6-6" /></svg>; }
export function IconUp() { return <svg {...STROKE}><path d="M6 15l6-6 6 6" /></svg>; }
export function IconDown() { return <svg {...STROKE}><path d="M6 9l6 6 6-6" /></svg>; }
export function IconCopy() { return <svg {...STROKE}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>; }
export function IconEye() { return <svg {...STROKE}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>; }
export function IconSearch() { return <svg {...STROKE}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>; }
