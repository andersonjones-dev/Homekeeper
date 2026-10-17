// Dark theme styles. "forest" is the original green; the others are cooler. bg is also used for the phone's status bar colour.
export const DARK_STYLES = {
  midnight: { label: 'Midnight', bg: '#0D1220', dot: '#8FA8FF' },
  aurora: { label: 'Aurora', bg: '#0A1A1D', dot: '#5EE0C8' },
  plum: { label: 'Plum', bg: '#16101F', dot: '#C79BFF' },
  forest: { label: 'Forest', bg: '#121815', dot: '#8FB09A' },
};
export const DEFAULT_DARK = 'midnight';
export const LIGHT_BG = '#F7F6F0';
export function darkBg(style) { return (DARK_STYLES[style] || DARK_STYLES[DEFAULT_DARK]).bg; }
