# Modos de juego y reglas de gameplay

## Dos ejes ortogonales, no una lista de modos

El prototipo de referencia deja clara una separación que hay que respetar en el código: lo
que el jugador tipea y de dónde sale el ritmo son **decisiones independientes**.

| | **Arcade** | **Canción simulada** | **Canción real** |
|---|---|---|---|
| **Flechas** | ✅ el del prototipo | ✅ | ✅ |
| **Palabras** | ✅ | ✅ | ✅ |

- **Eje 1 — tipo de secuencia:** `arrows` (↑↓←→) · `words` (es/en).
- **Eje 2 — fuente del ritmo:** `arcade` · `song` simulada (chiptune, velocidad elegida) ·
  `song` real (beatmap de la biblioteca).

Son **2×3 = 6 combinaciones**. Concretamente: el generador de secuencias no sabe de dónde
viene el ritmo, y el proveedor de ritmo no sabe qué se tipea. Si alguna vez tienes un
`if (mode === 'arcade')` dentro del generador de secuencias, los ejes se mezclaron.

## Cómo se reparten las responsabilidades

El motor (`engine.ts`) **no implementa ninguno de los dos ejes**. Recibe la secuencia y la
duración de la ronda **como datos** en `startRound`, y no sabe de dónde salieron.

| Quién | Qué decide |
|---|---|
| `sequence.ts` (eje 1) | Qué se tipea, dado **cuántas teclas** le piden |
| `rhythm.ts` (eje 2) | Cuánto dura la ronda, cuántas teclas, cuánto dura la partida |
| `loop.ts` | Los junta: le pide el largo al ritmo y se lo pasa a la secuencia |
| `engine.ts` | Timing, scoring, vidas. Nada de progresión |

> Este reparto no estuvo bien desde el principio. `startRound` calculaba la duración con la
> fórmula de arcade adentro, o sea que el motor tenía metido el eje 2. Con un solo modo no
> se notaba. Si aparece otra fuente de ritmo y hay que tocar `engine.ts`, algo se filtró.

## Modo Arcade — el primero a construir

Sin canción, sin descarga, sin biblioteca. **Es el modo que valida toda la mecánica.**
Por eso va primero: si el timing no se siente bien aquí, no lo va a salvar ningún beatmap.

Música: chiptune generado con osciladores de Web Audio (kick, hi-hat, línea de bajo,
adornos pentatónicos) a BPM fijo. Cero assets, cero descargas.

### Ciclo de ronda

1. Se muestra una secuencia (5 flechas, o una palabra).
2. El marcador recorre el riel de izquierda a derecha en `dur`.
3. El jugador tipea la secuencia completa.
4. Con la secuencia completa, presiona **ESPACIO** dentro de la zona.
5. Se resuelve: `perfect` / `good` / `miss`. Pausa de ~700ms. Siguiente ronda.

### Constantes (del prototipo — punto de partida, se calibran jugando)

```
duración de ronda   dur = max(1500, (4200 - (nivel - 1) * 350) * speedScale)   [ms]
nivel               nivel = 1 + floor(rondas jugadas / 4)
progreso            p = tiempo transcurrido / dur        ∈ [0, 1]

PERFECT             0.795 <= p <= 0.885
GREAT               0.755 <= p <= 0.925
GOOD                0.720 <= p <= 0.960
BAD                 0.670 <= p <= 0.985
MISS                cualquier otro caso, o p >= 1

multiplicador       mult = 1 + floor(combo / 5)
score               PERFECT 150 · GREAT 100 · GOOD 60 · BAD 20   (× mult)

vidas iniciales     3        (configurable 1–9)
bpm                 132      (configurable 100–170, paso 2)
speedScale          1.0      (configurable 0.6–1.6, paso 0.1)
```

**Todas estas constantes viven en UN módulo.** Números mágicos desparramados en el código
son la razón por la que después nadie se anima a calibrar el juego.

### Las ventanas están anidadas

`bad ⊃ good ⊃ great ⊃ perfect`, todas centradas en `0.84`. `judge` prueba de la más chica a
la más grande. Si alguien rompe el anidado, `judge` empieza a saltear escalones y el
degradado del riel deja de tener sentido — hay un test que lo impide.

### Qué hace cada escalón

| | Puntos | Combo | Vida | Espera después |
|---|---|---|---|---|
| `perfect` · `great` · `good` | sí | mantiene | — | pausa normal |
| `bad` | 20 | **corta** | — | pausa normal |
| `miss` | 0 | corta | **−1** | pausa **+ una ronda entera** |

**`bad` es el escalón que hace falta explicar.** Sumás algo y no perdés vida, pero se te
corta el combo. Sin eso sería un `good` flojo y no tendría razón de existir; con eso, es el
aviso de que estás al borde **antes** de empezar a perder vidas. Un `miss` que llega sin
advertencia se siente injusto.

### La progresión cuenta rondas, no aciertos

Tres rondas suben un escalón **se ganen o no**: tres aciertos o dos aciertos y un fallo dan
lo mismo. Si contara aciertos, al jugador que falla se le congelaría la dificultad justo
cuando necesita que la partida avance, y una mala racha lo dejaría estancado en el piso.

### La ronda de anticipo

Después de un fallo —y al volver de una pausa— no se juega la ronda siguiente: se muestra
**en anticipo**. La secuencia se ve al 35% de opacidad y el marcador corre igual, pero no se
acepta input. Al terminar, esa misma secuencia se convierte en la ronda de verdad.

Cubre dos cosas de un saque:

- **Frena el encadenado de fallos.** Machacar espacio después de fallar se comería las tres
  vidas sin ninguna chance de reaccionar: el fallo se vuelve autoinfligido y el juego se
  siente roto.
- **Le dice al jugador qué viene y cuándo.** Un hueco muerto se siente como que el juego se
  colgó. Con la secuencia a la vista y la barra corriendo, sabe exactamente qué va a tener
  que tipear y en qué momento arranca.

Volver de una pausa usa el mismo mecanismo, sin cuenta regresiva: un solo lenguaje visual
para "espera, ya vuelves a jugar".

### La cuenta regresiva va sobre la música

Al empezar, la canción arranca **primero** y la cuenta de tres segundos corre encima. La
intro suena mientras el jugador se acomoda, en vez de sonar en el vacío. Lo que espera es el
juego, no el audio: `config.startsAtMs` retiene el arranque de las rondas.

### Reglas de input

- Tecla **incorrecta** → la secuencia se reinicia (`idx = 0`), suena un error. **No se pierde
  vida.** El castigo es el tiempo perdido, que ya es suficiente.
- Se confirma con **ESPACIO o ENTER**, las dos valen (`CONFIRM_KEYS`). En palabras las manos
  están sobre las letras y estirarse hasta la barra rompe el tipeo; ENTER queda al lado del
  meñique. En flechas pasa lo mismo al revés.
- **Confirmar con la secuencia incompleta** → `MISS` directo.
- Cada tecla correcta sube de tono (`440 * 1.12^i`): da feedback de progreso sin mirar.
  **Salvo con una canción real sonando**, donde no suena: esa escalera está afinada contra
  el chiptune, y encima de una canción cualquiera queda desafinada y tapa justo lo que el
  jugador puso. El error sí suena en todos los modos — avisa de algo que hay que saber.

### Progresión

La barra se acelera **cada 4 aciertos**, con piso de 1500ms. El largo de la secuencia no se
mueve. Una sola palanca de dificultad por modo: aquí es la velocidad.

## Modo Canción

**El tempo lo pone la canción, y el tempo ES la velocidad.**

La barra cruza **un compás de 4/4**: cuatro beats, siempre. Es lo que hace el original, donde
el metrónomo va al BPM de la canción, se tipea dentro del compás y se confirma en el cuarto
beat. De ahí sale la regla entera:

```
duración de ronda   4 · 60000 / bpm        [ms]      ← una sola variable
teclas              min + (floor(rondas / roundsPerKeyStep) mod (max - min + 1))
                    piso 3 · techo 8 · sube cada 3 rondas jugadas
partida             dura lo que dure la canción
vidas               NINGUNA — `config.lives = null`
```

**Más BPM, barra más rápida. Siempre.** La relación es estrictamente decreciente y no puede
tener excepciones, porque no hay una segunda variable que la desvíe.

> ⚠️ **No agregues una segunda perilla de velocidad.** Ya se intentó dos veces y las dos
> salieron mal. El primer modelo elegía los beats por ronda buscando una duración objetivo,
> así que **cancelaba** el tempo: a 150 BPM la ronda duraba 1600ms y a 155 saltaba a 3096ms.
> El segundo dejó los beats como una perilla aparte: arreglaba la monotonía pero seguía
> teniendo dos variables para una sola cosa, y el jugador no sabía cuál mover.
>
> El "4beat / 8beat" del original —de donde salió esa idea— **no es velocidad: son
> direcciones**, 4 teclas contra 8. Ese eje ya existe aquí y es la cantidad de teclas.
>
> Hay tests de los dos lados que recorren los 200 tempos de a uno y fallan si la relación se
> vuelve a dar vuelta.

> ### La detección de tempo acierta 10 de 17, y arriba de 130 devuelve la mitad
>
> Eso es lo que hay hoy, medido contra un corpus de canciones reales con verdad de campo
> verificada (`src-tauri/bench/`). No es una decisión de diseño: es el techo al que se llegó.
>
> **Antes decía otra cosa acá, y estaba mal.** Decía que el rango se estrechaba a 60–145 a
> propósito para que el error quedara siempre en la misma dirección. Eso tapaba un síntoma. La
> causa real era que la función de novedad medía **energía de banda ancha**: en música no
> percusiva —una balada de piano, una guitarra rasgueada— el nivel es casi plano, la
> autocorrelación quedaba en 0.001, o sea ruido, y el tempo lo terminaba eligiendo la
> preferencia perceptual. Se comprobó: "Luna" devolvía 120.2 con la preferencia clavada en 121.
> El estimador estaba escupiendo su propia constante.
>
> Hoy la novedad es **flujo espectral** —cuánto cambió el contenido del espectro, no cuánto
> subió el volumen— y eso sí ve el ataque de un acorde. Con eso, cuatro canciones que fallaban
> por un factor de 1.33 pasaron a acertar, y ese error es el que importaba porque **ningún
> botón lo arregla**: el ×2 de la biblioteca corrige octavas, no tercios.
>
> Lo que **no** está resuelto es elegir el nivel métrico. En una señal de período P, la
> autocorrelación en 2P es igual de fuerte que en P: los dos son períodos de verdad, así que la
> ACF nunca puede preferir el fundamental. Se probaron dos formas de que decidiera el audio y
> **las dos se midieron y se descartaron** —sumar los múltiplos del candidato (inerte) y el
> contraste entre beat y medio beat (arregla los sintéticos, destroza la música real: 1/8)—.
> Queda la preferencia perceptual desempatando, centrada en 95, y por eso todo lo que pasa de
> ~130 sale a la mitad.
>
> **Lo que falta probar es análisis armónico** —cromagramas, ritmo de acordes— o una biblioteca
> de beat-tracking ya validada. La periodicidad de la energía sola no alcanza, y eso ya está
> medido tres veces.
>
> ### El corpus tiene calibración y validación, y esa partición no es opcional
>
> Se ajusta contra calibración y **no se mira validación** hasta cerrar. Sin eso, ajustar y
> medir contra lo mismo da 100% por construcción: hubo un barrido de parámetros que daba 11/11
> sobre señales sintéticas mientras el detector acertaba 5 de 11 canciones reales. Ese barrido
> se borró.
>
> ```bash
> bun run bench:fetch   # baja el audio del corpus
> SXT_SONGS_DIR=.../bench/audio cargo test --release -- --ignored corpus --nocapture
> ```


En la canción **simulada** el jugador elige el BPM, y ese mismo BPM mueve el chiptune y la
barra: van juntos. En la **real** el BPM sale del análisis y se ajusta en la biblioteca.

**En canción no hay vidas.** No es un descuido: cortar la partida a la mitad por fallar es
sacar al jugador de la canción, que es exactamente lo contrario de lo que hace el género.
Se falla, se pierde combo y puntaje, y se sigue hasta el final.

La curva es un **diente de sierra**: sube de a una tecla hasta el techo y vuelve al piso.
Volver al piso es deliberado — da respiro y hace que la partida se sienta como una canción
con estrofas y estribillo, no como una rampa que no termina más.

### Canción simulada

Misma mecánica, pero con el chiptune en vez de una canción descargada. Existe para poder
construir y calibrar el modo canción **sin depender del pipeline de audio**, que es la parte
más cara del proyecto. Cuando llegue el beatmap real, reemplaza a `songRhythm` y nada más
cambia.

### El largo de la palabra ES la dificultad

En modo canción, una palabra de 8 letras no es un caso raro: es el nivel 8. Por eso las
listas de `data/words/` cubren **todas** las longitudes entre el piso y el techo, y se elige
por longitud, no al azar. Un hueco en la lista es un escalón que el juego se saltea.

## Reloj — vale para los dos modos

El prototipo usa `performance.now()`. **En el proyecto no.** El reloj maestro es siempre
`audioContext.currentTime`:

- En modo canción es **obligatorio**: cualquier otro reloj deriva respecto del audio y
  desincroniza la partida.
- En modo arcade es **gratis y mejor**: la música procedural ya se agenda sobre el reloj de
  audio, así que usar el mismo reloj para la barra los deja en la misma base de tiempo.

Un solo reloj para los dos modos = un solo código de timing que testear.

**El scheduler de audio usa lookahead**: un `setInterval` de ~30ms que agenda eventos ~120ms
en el futuro con `currentTime`. No se agenda desde `setTimeout` directo — el timer del
navegador no tiene la precisión necesaria. Es el patrón estándar de Web Audio; no lo
"simplifiques".

## Propiedad deliberada del modo arcade

En arcade, **la barra y la música NO están sincronizadas**: la barra dura según el nivel, la
música corre a BPM fijo. Coexisten sin alinearse, y está bien — el jugador sigue la barra,
no el beat. **No es un bug.** Si alguien lo "arregla", la curva de dificultad desaparece.

## Ranking local

Top 5 por puntaje, con nombre de hasta 10 caracteres, persistido localmente. Va al mismo
almacenamiento que la biblioteca (directorio de datos de la app), **no a `localStorage`**:
el prototipo usa `localStorage` porque corre en una página suelta; en la app de escritorio
el estado del jugador vive junto a la biblioteca.

## Accesibilidad mínima

- El estado de una jugada se comunica por **texto + color**, nunca solo por color.
- Reasignación de teclas queda fuera del MVP, pero el input se lee de un mapa, no con
  comparaciones de strings desparramadas. Cambiarlo después tiene que ser barato.
