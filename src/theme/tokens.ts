/**
 * Tokens de color y tipografía. Fuente de verdad ÚNICA: la lee el canvas del
 * gameplay y la va a leer la UI de React. Dos paletas que se desincronizan es
 * un bug garantizado.
 *
 * Detalle y significado de cada acento en `.claude/rules/design-system.md`.
 */

export const COLORS = {
  bg: '#0b0b12',
  surface: '#1c1c2a',
  surfaceSunken: '#15151f',
  track: '#191924',
  tileIdle: '#232336',

  border: '#3a3d56',
  borderCard: '#33364e',
  borderMuted: '#2c2f45',

  text: '#e8eaf6',
  textSecondary: '#aab0cf',
  textMuted: '#8b8fae',

  /** Acción, combo, acierto, vidas. */
  magenta: '#ff2e88',
  magentaLight: '#ff5aa5',
  magentaDark: '#c1156b',
  /** Selección, multiplicador, puntaje, GOOD. */
  cyan: '#29e5ff',
  /** La zona objetivo y PERFECT. El color de "acá tenés que apretar". */
  gold: '#ffd23e',
  /** MISS. */
  red: '#ff4d6d',
  /** Solo fondo psicodélico. */
  purple: '#8b5cff',
} as const

/**
 * ponytail: Bungee y Chakra Petch todavía no están embebidas, así que por ahora
 * cae al fallback del sistema. Al meter las fuentes en `src/assets/fonts/` esto
 * empieza a andar sin tocar nada más.
 */
export const FONTS = {
  display: "'Bungee', system-ui, sans-serif",
  ui: "'Chakra Petch', system-ui, sans-serif",
} as const

/** Alpha de los rellenos de zona sobre el riel. */
export const ZONE_ALPHA = {
  good: 0.12,
  perfect: 0.28,
} as const
