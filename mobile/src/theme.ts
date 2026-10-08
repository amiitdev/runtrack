/**
 * RunTrack design tokens. Dark, high-contrast — you read this screen
 * outdoors while out of breath.
 */
export const colors = {
  bg: '#0B1120',
  surface: '#121A2D',
  surfaceAlt: '#18233B',
  border: '#22304F',

  primary: '#22D3EE',
  primaryDim: '#0E7490',
  accent: '#A3E635',
  warning: '#FBBF24',
  danger: '#F87171',

  text: '#E7EEF9',
  textDim: '#93A4C0',
  textFaint: '#5D6E8C',

  // effort / chart colours
  bar: '#38BDF8',
  barTrack: '#1E2A44',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const type = {
  hero: { fontSize: 56, fontWeight: '700' as const, letterSpacing: -1.5 },
  title: { fontSize: 24, fontWeight: '700' as const },
  stat: { fontSize: 26, fontWeight: '700' as const },
  label: { fontSize: 11, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
} as const;
