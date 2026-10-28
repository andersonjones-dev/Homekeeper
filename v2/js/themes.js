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

// Looks: Classic is the original. The others restyle colours, headings and a little decoration; layout and features are identical.
// bg = [light, dark] status bar colours. Onyx is always dark. fonts = Google Fonts loaded only when the look is chosen.
export const LOOKS = {
  classic: { label: 'Classic', dot: '#607C69', dotBg: '#E9EEE7', bg: null },
  linen: { label: 'Linen', dot: '#A8553B', dotBg: '#F0E1D2', bg: ['#F7F1E8', '#1A1512'], fonts: 'family=Fraunces:opsz,wght@9..144,500;9..144,600' },
  fern: { label: 'Fern', dot: '#2F7A4B', dotBg: '#DDEDD7', bg: ['#EEF5EA', '#0E1A12'], fonts: 'family=Bricolage+Grotesque:opsz,wght@12..96,700' },
  neu: { label: 'Neumorphic', dot: '#B93A22', dotBg: '#E6E9EF', bg: ['#E6E9EF', '#23272F'], fonts: 'family=Mulish:wght@400;700' },
  bento: { label: 'Bento Grid', dot: '#2D5BFF', dotBg: '#F4F4F2', bg: ['#F4F4F2', '#0B0B0C'], fonts: 'family=Outfit:wght@400;700' },
  onyx: { label: 'Onyx', dot: '#E8C98A', dotBg: '#000000', bg: ['#000000', '#000000'], fonts: 'family=Sora:wght@600', alwaysDark: true },
};
export const DEFAULT_LOOK = 'classic';
export function lookKey(l) { return LOOKS[l] ? l : DEFAULT_LOOK; }
export function barColour(look, dark, style) {
  const L = LOOKS[lookKey(look)];
  if (L.bg) return L.bg[dark ? 1 : 0];
  return dark ? darkBg(style) : LIGHT_BG;
}
export function loadLookFonts(look) {
  const L = LOOKS[lookKey(look)];
  if (!L.fonts || typeof document === 'undefined') return;
  const id = 'look-fonts-' + lookKey(look);
  if (document.getElementById(id)) return;
  const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?' + L.fonts + '&display=swap';
  document.head.appendChild(link);
}
