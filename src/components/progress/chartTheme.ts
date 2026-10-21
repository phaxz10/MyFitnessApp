import type { CSSProperties } from 'react';

// Shared recharts styling. Colours are CSS variables so charts follow the
// light/dark tokens in index.css.

export const AXIS_TICK = { fill: 'var(--ink-3)', fontSize: 12 };

export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  color: 'var(--ink)',
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: 'var(--ink-2)' };
