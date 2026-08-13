# Sistema de diseño — SPACE x TYPE

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
| `magenta` | `#ff2e88` | Acción primaria, combo, vidas, `GREAT`. Variantes: `#ff5aa5` (claro), `#d61a77` / `#c1156b` (oscuro) |
| `cyan` | `#29e5ff` | Selección, multiplicador, puntaje, `GOOD`, links |
| `gold` | `#ffd23e` | **El centro de la zona y `PERFECT`.** Es el color de "presiona aquí". Variantes: `#ffe27a`, `#ffc21e` |
| `red` | `#ff4d6d` | `MISS` |
| `purple` | `#8b5cff` | `BAD` y el fondo psicodélico |

Los cinco escalones usan **gold · magenta · cyan · purple · red** en el texto de feedback y
en el panel de resultados.

## El riel: brillo, no color

El riel **no** usa esos cinco colores. Se pinta con un único degradado horizontal que va de
`flare` (casi blanco) en el centro a `cyan` transparente en los bordes de `BAD`. Los stops
son las constantes de `TIMING`.

| Token | Hex | Uso |
|---|---|---|
| `flare` | `#e8fbff` | Núcleo de la zona de acierto en el riel |

La información va en la **luminancia**, no en el matiz, y eso es deliberado:

- El ojo lee brillo mucho más rápido que color. En un juego que se juega a velocidad, eso
  es la diferencia entre llegar y no llegar.
- Un jugador daltónico distingue perfectamente claro de oscuro. Con un degradado de matices
  no distinguía nada.
- Con cuatro ventanas anidadas, pintar cada una de su color las convierte en una torta de
  capas que no comunica nada.

El brillo cae de forma **monótona** desde el centro hasta el borde de `BAD`. No hay marcas
de borde: la rampa misma señala dónde está el centro.

## La escalera de dificultad

En modo canción, arriba del riel va una escalera de un escalón por cada largo posible de
secuencia (`SONG.minKeys` a `SONG.maxKeys`). Alturas crecientes de izquierda a derecha; se
prenden los alcanzados y el actual brilla.

**No lleva texto, y es a propósito.** Un `TECLAS 6` da el número, pero el número no es el
dato: lo que el jugador necesita percibir de un vistazo es *dónde está en la curva* —si
viene subiendo, si está cerca del techo, si acaba de reiniciar—. La forma ascendente indica
"esto se pone más difícil" sin una palabra, y la cantidad exacta ya está a la vista en las
casillas.

## Dónde va cada cosa

Esta es la regla que ordena el HUD:

> **Lo que usas para decidir va cerca de donde miras. Lo que usas para saber cómo vas puede
> estar lejos.**

Durante la partida los ojos van de las casillas al marcador. La escalera de dificultad vive
ahí, entre las dos. El puntaje, el combo y el tiempo van arriba: son contexto, no
información de acción.

De ahí sale el reparto vertical: **la mitad de arriba es del visualizador y la de abajo es
del juego.** Las casillas van al 68% del alto y el riel al 80%, juntos y abajo; la figura va
centrada al 33%, arriba. Entre los dos bloques queda una franja vacía.

Antes las casillas estaban al 42% y el riel al 62%, con la figura en el medio de las dos: el
fondo se metía **dentro** del área de juego en vez de estar detrás, y las tres cosas se leían
como una sola embarullada. Juntar el juego abajo también acortó el recorrido de la mirada
entre lo que hay que tipear y dónde hay que confirmar.

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

**Visualizador circular** — una figura en el centro y barras de sonido saliendo de secciones
del anillo. Reemplaza al fondo psicodélico del prototipo **y** al plan de poner el video de
YouTube de fondo.

**El visualizador solo escucha la música.** El grafo de audio tiene dos ramas —
`música → analyser → destination` y `efectos → destination`— y los efectos del juego no
pasan por el analizador. Si pasaran, el anillo reaccionaría a cada tecla que toca el jugador
y a cada veredicto de ronda: sería un medidor de lo que uno mismo aprieta, no una reacción a
la canción. El chiptune sí va por la rama de música, porque cuando no hay canción el
chiptune **es** la música.

**El estado base es la figura sola, sin ninguna barra.** Hay una compuerta de nivel: lo que
no pasa el umbral no se dibuja. Sin eso, el piso de ruido del análisis mantenía todo el
anillo levantado a media asta y las barras se leían como decoración permanente en vez de
como una reacción a un sonido.

**La ventana de decibeles del analizador es lo que decide cuántas barras se encienden.**
`getByteFrequencyData` no devuelve amplitud: mapea un rango de dB a 0–255, y el rango por
defecto (−100 a −30) deja a toda la música arriba. Medido sobre una canción real, el 100% de
las barras quedaba al máximo, y ninguna curva de contraste puede separar algo que ya viene
saturado.

Los valores salen de medir el espectro banda por banda de una canción de verdad: va de −78 dB
en la barra más floja a −34 en la más fuerte, con la mediana en −52. Con la ventana en
−80/−32 y la curva de contraste en 4, quedan **24 de 72 barras encendidas** —un tercio del
anillo— con el pico en 1.0 y la mediana en 0.22.

> ⚠️ Tocar `fftSize` corre la escala de dB, porque la energía se reparte entre más bins. Si se
> cambia uno, hay que volver a medir el otro.

La FFT es de 4096 y no de 1024 por una razón medida: con 1024 las diez barras más graves caían
todas en el **mismo bin** y leían el mismo valor, o sea que se movían idénticas.

Cada barra lee **su propia banda de frecuencia**, repartidas en escala logarítmica porque el
oído oye en octavas. Esa es la regla que no se puede romper: un intento anterior agrupaba
todo en tres bandas gruesas, y dentro de un grupo todas las luces recibían el mismo valor,
así que se prendían juntas. Era un latido, no un espectro.

**El reparto banda→posición va mezclado**, con semilla. Sin mezclar, las frecuencias quedan
ordenadas alrededor del círculo y un golpe de bombo levanta un solo sector: se ve como una
aguja girando. Mezclado, un sonido enciende posiciones dispersas del anillo, que es el efecto
de los videos musicales.

72 barras con el trazo al 80% del espacio entre ellas: gruesas y pegadas, no palitos sueltos.
Bajar de 96 a 72 es lo que deja engrosar el trazo sin que se separen.

**Catálogo de figuras** — `vinilo`, `auriculares`, `casco`, `nucleo`. Todas circulares y
dibujadas con primitivas de canvas: el proyecto no lleva assets. La figura se elige con un
hash del id de la canción, así que **es estable por canción** —la misma canción se ve siempre
igual, y eso le da identidad— pero cambia entre canciones.

Los tramos del anillo donde hay barras son parte de cada figura, no decoración: los
auriculares dejan libre donde van las orejeras, el casco deja libre el visor.

> ✅ **Medido con el gameplay corriendo.** A 1280×720, en el **peor caso** —las 72 barras
> encendidas al mismo tiempo—, medianas de tandas alternadas para cancelar la deriva de la
> máquina: el render pasa de **0.162 ms a 0.315 ms** por frame. El visualizador cuesta
> **0.153 ms**, el 1.9% del presupuesto de 16.67 ms a 60fps. En reposo cuesta bastante menos,
> porque las barras apagadas ni entran al dibujo.
>
> El contraste del riel **no se mueve**: 105 puntos de luminancia entre el centro de la zona y
> el borde, idéntico con el fondo apagado y con cualquiera de las cuatro figuras.
>
> Aun así **es apagable** desde el menú (`FONDO: VISUAL / LISO`). El fondo nunca le gana al
> loop de juego.

**Un gradiente para todas las barras.** Se define hacia arriba y son las barras las que giran
debajo de él, porque un gradiente de canvas se pinta con la transformación vigente. Armarlo
por barra y por frame costaba **0.685 ms** — más de cuatro veces. Es el error clásico de este
tipo de efecto y hay que resistirlo.

El fondo psicodélico original usaba `filter: blur(34px) contrast(18)` sobre el contenedor
—ese par es lo que produce el efecto *metaball* de lámpara de lava; separados no hacen nada—
más un `hue-rotate` de 40s. Queda documentado porque es lindo, pero **no se construyó**: era
un blur a pantalla completa animándose bajo un juego de 60fps.

## Geometría y movimiento

- Radios: `8px` (chips) · `9–10px` (botones) · `12–14px` (paneles, riel).
- Casilla de secuencia: **círculo** de `66px` de diámetro, con gradiente radial cuyo foco
  está arriba a la izquierda —un gradiente centrado se ve plano por más colores que le
  pongas—, anillo de `3px` y un arco de reflejo en la mitad superior.
- Las flechas se dibujan con uniones y puntas redondeadas, contorno grueso primero y
  relleno encima: eso les da el aire de sticker. El polígono crudo se veía duro y de otro
  juego.
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
