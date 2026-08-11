# Sistema de diseño — CROMA//BEAT

Extraído del prototipo de referencia (`design/`, **no versionado**). Esta es la fuente de
verdad del estilo: si el prototipo se pierde, esto queda.

Estética: **arcade neón / retro-futurista**. Fondo casi negro azulado, cromo metálico en los
títulos, y tres acentos de neón. Nada de pasteles, nada de flat claro.

## Paleta

Se define **una sola vez** como variables de tema de Tailwind 4 (`@theme`). Nunca se
hardcodea un hex en un componente.

### Superficies

| Token | Hex | Uso |
|---|---|---|
| `bg-base` | `#0b0b12` | Fondo raíz |
| `bg-grad` | `#101018` → `#0b0b12` (55%) → `#141420` | Gradiente de pantalla completa |
| `surface` | `#1c1c2a` → `#13131d` | Tarjetas y paneles (gradiente vertical) |
| `surface-sunken` | `#15151f` | Inputs, filas de ranking |
| `surface-track` | `#191924` → `#101018` | Riel de la barra de timing |
| `tile-idle` | `#232336` → `#15151f` | Casilla de secuencia sin completar |

### Bordes

| Token | Hex | Uso |
|---|---|---|
| `border` | `#3a3d56` | Por defecto |
| `border-card` | `#33364e` | Paneles |
| `border-muted` | `#2c2f45` | Inactivo, vida gastada |

### Texto

| Token | Hex | Uso |
|---|---|---|
| `text` | `#e8eaf6` | Principal |
| `text-secondary` | `#aab0cf` | Descripciones |
| `text-muted` | `#8b8fae` | Labels en mayúscula con tracking |

### Acentos — cada uno significa algo

**No son intercambiables.** El color comunica estado; usarlos al azar rompe la lectura del
juego a velocidad.

| Token | Hex | Significa |
|---|---|---|
| `magenta` | `#ff2e88` | Acción primaria, combo, acierto, vidas. Variantes: `#ff5aa5` (claro), `#d61a77` / `#c1156b` (oscuro) |
| `cyan` | `#29e5ff` | Selección, multiplicador, puntaje, `GOOD`, links |
| `gold` | `#ffd23e` | **La zona objetivo y `PERFECT`.** Es el color de "acá tenés que apretar". Variantes: `#ffe27a`, `#ffc21e` |
| `red` | `#ff4d6d` | `MISS` |
| `purple` | `#8b5cff` | Solo en el fondo psicodélico |

## Tipografía

| Fuente | Pesos | Uso |
|---|---|---|
| **Bungee** | único | Títulos, números grandes (score, combo, mult), glifos de secuencia, botones de acción |
| **Chakra Petch** | 400 / 600 / 700 | Todo el resto de la UI |

Labels chicos: `11–12px`, `700`, **mayúscula**, `letter-spacing: 3–6px`, color `text-muted`.
Ese tracking ancho es firma del estilo — no lo saques.

## Efectos característicos

**Texto cromado** (títulos, score) — gradiente vertical con `background-clip:text` y
`color:transparent`. El título grande suma `titleshine` (5s lineal infinito) moviendo el
`background-position`, y `drop-shadow` magenta abajo + cyan arriba para el borde neón.

**Glow neón** — `text-shadow` / `box-shadow` con el acento a `.4–.6` alpha. Los números
importantes brillan; el texto normal no.

**Scanlines** — `repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 7px)`
sobre todo, con `pointer-events:none`.

**Viñeta** — `radial-gradient` elíptico azulado al 42% de altura.

**Fondo psicodélico** — blobs de color con `filter: blur(34px) contrast(18)` en el contenedor.
Ese par blur+contrast es lo que produce el efecto *metaball* de lámpara de lava; separados no
hacen nada. Encima, `hue-rotate` de 40s y dos capas de oscurecimiento.

> ⚠️ **Ese filtro es caro.** Es un `blur` + `contrast` a pantalla completa animándose bajo un
> juego que tiene que sostener 60fps. **Hay que medirlo con el gameplay corriendo**, no
> solo. Si come frames: pasa a canvas/WebGL, o queda como opción con aviso. El fondo nunca
> le gana al loop de juego.

## Geometría y movimiento

- Radios: `8px` (chips) · `9–10px` (botones) · `12–14px` (paneles, riel) · `13px` (casillas).
- Casilla de secuencia: `66×66px`.
- Riel de timing: `min(720px, 86vw) × 48px`.
- Transiciones de UI: `.12–.15s`. Feedback (`fbpop`): `.7s ease-out`.
- La zona dorada pulsa (`zonepulse`, 1s) — es lo único que late en pantalla. Que siga así.

## Reglas

- Tokens en `@theme` de Tailwind 4. **Cero hex sueltos en componentes.**
- El **canvas del gameplay** lee los colores del mismo módulo de tokens que la UI. Dos
  paletas que se desincronizan es un bug garantizado.
- Fuentes **embebidas localmente**, no desde Google Fonts: la app es de escritorio y tiene
  que funcionar sin internet. La CSP no permite orígenes remotos.
- Los estados del juego (`PERFECT` / `GOOD` / `MISS`) no se distinguen **solo** por color:
  también cambian el texto. Un jugador daltónico tiene que poder jugar.
