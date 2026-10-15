/** Colours the figures draw with. They match the site tokens. */
export const C = {
  ink: '#f3f6fb',
  mute: '#93a0b8',
  dim: '#7a88a0',
  line: 'rgba(255,255,255,0.1)',
  accent: '#8b7cff',
  blue: '#3e9bff',
  ok: '#34d399',
  warn: '#ffb547',
  bad: '#ff6b81',
};

/** Same colour with an alpha, from a #rrggbb string. */
export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export const FONT = "500 12px 'Montserrat', system-ui, sans-serif";
