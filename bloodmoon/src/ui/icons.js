/**
 * Original inline SVG icons (24×24 viewBox) for abilities and items.
 */
const S = (body, color = '#ff4a62') => `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  sword: S('<path d="M5 19l9.5-9.5M14.5 9.5L19 4l1 1-5.5 4.5M7 15l2 2M4 20l2-2M8.5 13.5l2 2"/>'),
  heavy: S('<path d="M3 14c5-6 13-8 18-7-5 1-10 4-13 9"/><path d="M5 19l6-6M3 21l2-2"/>'),
  blades: S('<path d="M4 20L14 6l2-3-.5 3.5L6 20M20 20L10 6 8 3l.5 3.5L18 20"/>'),
  crescent: S('<path d="M16 3a9 9 0 1 0 5 12A7 7 0 1 1 16 3z"/>'),
  dual: S('<path d="M5 19L15 9l3-5-5 3L3 17M19 19L9 9 6 4l5 3 10 10"/>'),
  block: S('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>', '#9ac4ff'),
  blink: S('<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v2M12 20v2M2 12H1M23 12h-1"/>'),
  drain: S('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>'),
  eclipse: S('<circle cx="12" cy="12" r="5" fill="#000"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>', '#ff6a3a'),
  roses: S('<path d="M12 9c-2-3 1-6 3-4 2-2 4 2 1 4 2 2-1 5-4 3-3 2-6-1-4-3-3-2-1-6 1-4 1-1 3 0 3 4"/><path d="M12 13v8M12 17c-2-1-4 0-5 1M12 18c2-1 4-1 5 0"/>'),
  chains: S('<rect x="3" y="9" width="8" height="6" rx="3"/><rect x="13" y="9" width="8" height="6" rx="3"/><path d="M9 12h6"/>'),
  queen: S('<path d="M4 17l2-9 4 5 2-7 2 7 4-5 2 9z"/><path d="M4 20h16"/><circle cx="12" cy="4" r="1"/>', '#ffb04a'),
  dash: S('<path d="M3 8h9M5 12h10M3 16h9M15 6l6 6-6 6"/>', '#9ac4ff'),
  guard: S('<circle cx="12" cy="12" r="8"/><path d="M12 6l2 4 4 .5-3 3 1 4.5-4-2-4 2 1-4.5-3-3 4-.5z"/>', '#9ac4ff'),
  execution: S('<path d="M12 2v20M5 5l14 14M19 5L5 19"/><circle cx="12" cy="12" r="3"/>', '#bad8ff'),
  vial: S('<path d="M9 3h6M10 3v5l-4 8a4 4 0 0 0 3.6 5.5h4.8A4 4 0 0 0 18 16l-4-8V3"/><path d="M7.5 14h9"/>'),
  key: S('<circle cx="7" cy="12" r="3.5"/><path d="M10.5 12H21M17 12v3M20 12v2"/>', '#d8b060'),
  relic: S('<path d="M12 2l4 6-4 14-4-14z"/><path d="M8 8h8"/>', '#d8b060'),
  record: S('<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3M9 10h6M9 13h6M9 16h4"/>', '#d8b060'),
  clue: S('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21"/>', '#d8b060'),
};

export const ABILITY_ICONS = {
  lucien: { lmb: 'sword', rmb: 'heavy', q: 'blink', e: 'drain', r: 'eclipse' },
  seraphina: { lmb: 'blades', rmb: 'crescent', q: 'roses', e: 'chains', r: 'queen' },
  kairo: { lmb: 'dual', rmb: 'block', q: 'dash', e: 'guard', r: 'execution' },
};
