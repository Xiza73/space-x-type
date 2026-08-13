/**
 * Espejo en TypeScript de los tokens de `src/index.css`, para el canvas del
 * gameplay — que no puede usar clases de Tailwind.
 *
 * Las claves son el camelCase de las variables CSS: `--color-magenta-light`
 * es `magentaLight`. `tokens.test.ts` compara los dos archivos y falla si
 * divergen. Dos paletas desincronizadas es un bug garantizado, así que en vez
 * de confiar en la disciplina hay una prueba.
 */

export const COLORS = {
  night: '#0b0b12',
  surface: '#1c1c2a',
  surfaceDeep: '#13131d',
  sunken: '#15151f',
  track: '#191924',
  trackDeep: '#101018',
  tile: '#232336',

  line: '#3a3d56',
  lineCard: '#33364e',
  lineMuted: '#2c2f45',

  ink: '#e8eaf6',
  inkSoft: '#aab0cf',
  inkMuted: '#8b8fae',

  /** Acción, combo, acierto, vidas. */
  magenta: '#ff2e88',
  magentaLight: '#ff5aa5',
  magentaDark: '#c1156b',
  /** Selección, multiplicador, puntaje, GOOD. */
  cyan: '#29e5ff',
  /** Núcleo de la zona de acierto en el riel. */
  flare: '#7dffdd',
  /** La zona objetivo y PERFECT. El color de "presiona aquí". */
  gold: '#ffd23e',
  goldLight: '#ffe27a',
  goldDark: '#ffc21e',
  /** MISS. */
  red: '#ff4d6d',
  /** Solo fondo psicodélico. */
  purple: '#8b5cff',
} as const

/** Espejo de `--font-display` / `--font-ui`. Se declaran en `src/index.css`. */
export const FONTS = {
  display: "'Bungee', system-ui, sans-serif",
  ui: "'Chakra Petch', system-ui, sans-serif",
} as const

/** Alpha de los rellenos de zona sobre el riel. */
export const ZONE_ALPHA = {
  good: 0.12,
  perfect: 0.28,
} as const
