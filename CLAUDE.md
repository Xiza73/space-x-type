# SPACE x TYPE

## Contexto del proyecto

Juego de ritmo + mecanografía para escritorio, inspirado en la mecánica de **Audition**:
una barra horizontal avanza a velocidad constante y sobre ella aparece una secuencia de
inputs que hay que **tipear** antes de confirmar con la **barra espaciadora** dentro de la
ventana de timing correcta.

Diferencias con el original: sin baile, sin avatares, sin social. Entrás y juegas.

Nombre de producto: **SPACE x TYPE**. La "x" se lee como cruce: es literalmente lo que hace
el juego — tipo de secuencia × fuente del ritmo. El prototipo de referencia se llamaba
`CROMA//BEAT`; ese nombre quedó descartado.

Cuatro aportes propios:

1. **Modo arcade** — sin canción: música chiptune generada con osciladores, vidas, y la barra
   que se acelera con cada nivel. Es el modo que valida toda la mecánica.
2. **Modo palabras** — además de secuencias de flechas, la secuencia puede ser una palabra
   real en español o inglés (bibliotecas de palabras embebidas).
3. **Procesador musical** — le pasas una URL de YouTube, el sistema descarga el audio,
   detecta BPM/onsets y genera un beatmap que dura toda la partida. El fondo puede ser el
   video original con baja opacidad o visuales psicodélicos generativos.
4. **Biblioteca personal** — cada canción procesada se guarda en el disco. Al entrar,
   eliges una de tu biblioteca o procesas una nueva. Procesar es una operación de **una sola
   vez** por canción, no un paso previo a cada partida.

Tipo de secuencia (flechas/palabras) y fuente del ritmo (arcade/canción simulada/canción
real) son **ejes ortogonales**: 2×3 = 6 combinaciones. Cada fuente de ritmo trae su propia
palanca de dificultad — arcade acelera la barra, canción sube la cantidad de teclas.
Detalle en `@.claude/rules/game-modes.md`.

**Uso personal.** No hay usuarios externos ni distribución pública del contenido musical.

## Usuarios y alcance (MVP)

Usuario objetivo: el autor. Un jugador, offline, en su propia máquina.

El MVP cubre **los cuatro modos** (flechas/palabras × arcade/canción). Orden de construcción:

1. **Arcade + flechas** — loop completo: barra, ventanas de timing, scoring, combo,
   multiplicador, vidas, aceleración por nivel, chiptune procedural. Punto de validación.
2. **Arcade + palabras** — mismo motor, otro generador de secuencias (es/en).
3. Pipeline de audio: URL de YouTube → `yt-dlp` → archivo local → BPM → beatmap.
4. **Biblioteca personal**: persistir la canción procesada y poder elegirla al entrar.
5. **Canción + flechas** y **canción + palabras** — el beatmap reemplaza al generador
   procedural. El motor no cambia.
6. Fondos: metálico (default) y psicodélico. El video de YouTube de fondo queda para después.
7. Ranking local top 5.

**Fuera del MVP:** multijugador, cuentas, leaderboards online, editor de beatmaps,
reasignación de teclas, móvil.

## Stack y herramientas

| Capa | Elección | Por qué |
|---|---|---|
| Shell desktop | **Tauri v2** (Windows/macOS/Linux) | Core Rust + WebView del sistema. Binarios chicos, cross-platform real |
| Core / IPC | **Rust** | Descarga (`yt-dlp`), análisis de audio, FS, caché de beatmaps |
| UI | **React 19 + TypeScript** (strict) | Menús, HUD, configuración |
| Render gameplay | **Canvas 2D + `requestAnimationFrame`** | Loop desacoplado de React. Sin dependencias |
| Estado | **Zustand 5** | Estado de UI/sesión. El estado del loop vive fuera de React |
| Estilos | **Tailwind CSS 4** | Solo UI, no gameplay |
| Audio | **Web Audio API** | Reproducción y reloj maestro |
| Análisis BPM | Rust (crate de detección de onsets) | Offline, una sola vez por canción |
| Persistencia | **JSON en el directorio de datos de la app** | Biblioteca personal. Sin base de datos |
| Runtime / package manager | **Bun** | Instalación y scripts. Sin `npm` ni `pnpm` |
| Tests | **Vitest** (front) + **`cargo test`** (core) | Cada lado en su lenguaje |
| Lint | **oxlint** | Viene con el template de Vite. Sin ESLint |
| Bundler | **Vite** | Estándar de Tauri v2 |

**Requisitos externos:** `yt-dlp` en el `PATH`, **y un runtime de JavaScript**
(`deno`, `node`, `bun` o `quickjs`) también en el `PATH`.

El runtime no es opcional: YouTube exige resolver un desafío en JavaScript para firmar la
URL del stream, y sin él la descarga falla con **403 Forbidden** sin decir por qué. yt-dlp
habilita solo `deno` por defecto, así que el proyecto le pasa los cuatro con
`--js-runtimes` y usa el que encuentre.

> ⚠️ **Pendiente para el instalador.** Hoy las dos dependencias se asumen presentes porque
> el uso es personal. El instalador del MVP tiene que resolverlas —detectarlas, ofrecer
> instalarlas, o empaquetarlas— porque un usuario que abre la app y recibe un 403 no tiene
> forma de saber que le falta Deno. `yt-dlp` además pide Python 3.11 o superior a partir de
> 2026.

## Comandos clave

```bash
bun install               # instalar dependencias
bun run tauri dev         # dev — app + hot reload
bun run tauri build       # build de producción (binario nativo)
bun run test              # tests del frontend (Vitest)
bun run typecheck         # tsc -b (project references)
bun run lint              # oxlint
cargo test  --manifest-path src-tauri/Cargo.toml    # tests del core Rust
cargo clippy --manifest-path src-tauri/Cargo.toml   # lint del core Rust
cargo fmt   --manifest-path src-tauri/Cargo.toml    # formato Rust
```

**Bun es el único package manager.** Nada de `npm` ni `pnpm`: no se commitea
`package-lock.json` ni `pnpm-lock.yaml`, solo `bun.lock`.

Gate antes de commitear: `bun run typecheck && bun run lint && bun run test` y, si tocaste
Rust, `cargo clippy` + `cargo test`. Lo mismo corre solo en cada PR
(`.github/workflows/ci.yml`).

**La versión de Rust está fijada en `rust-toolchain.toml`.** No es burocracia: la primera
corrida del CI falló por un lint que existía en su compilador y no en el local. Ahora los dos
usan el mismo, y subir ese número es una decisión que se toma en su propio commit.

## Reglas detalladas

@.claude/rules/code-style.md
@.claude/rules/game-modes.md
@.claude/rules/design-system.md

## Estructura del repositorio

Single-package (no monorepo): un frontend + un core Rust, versionados juntos.

```
├── src/                      # frontend (React + TS)
│   ├── game/                 # motor: loop, timing, scoring, input — SIN React
│   │   └── constants.ts      # ventanas, scoring, progresión — TODO junto
│   ├── audio/                # Web Audio, reloj maestro, chiptune procedural
│   ├── library/              # tipos y cliente de la biblioteca personal
│   ├── components/           # UI React (menús, HUD, settings)
│   ├── stores/               # Zustand
│   ├── theme/                # tokens de color y tipografía (UI + canvas)
│   ├── assets/fonts/         # Bungee, Chakra Petch — embebidas, sin CDN
│   └── data/words/           # bibliotecas de palabras es/en
├── src-tauri/                # core Rust
│   ├── src/commands/         # comandos expuestos al frontend
│   ├── src/audio/            # yt-dlp, decodificación, detección de BPM
│   ├── src/library/          # índice, lectura/escritura, integridad
│   └── tauri.conf.json
├── design/                   # prototipo de referencia — NO versionado
└── .claude/
    ├── rules/                # convenciones, modos de juego, sistema de diseño
    ├── commands/  skills/  agents/
```

`design/` es material de referencia local y está en `.gitignore`. **Lo que importa de ahí ya
está extraído a `.claude/rules/`** — si necesitas la paleta o las constantes del prototipo,
están ahí, versionadas.

## Integraciones externas

| Servicio | Uso | Nota |
|---|---|---|
| **YouTube** vía `yt-dlp` | Descargar audio de una URL para analizar y reproducir | Binario externo, no una API. Requiere `yt-dlp` en el `PATH` |

Sin auth, sin pagos, sin backend. Todo es local.

## Biblioteca personal (persistencia)

Cada canción procesada se guarda en el **directorio de datos de la app** (`app_data_dir`).
Procesar es una operación de **una sola vez**: si la URL ya está en la biblioteca, se reusa.

```
<app_data_dir>/
├── library.json           # índice: id, título, duración, bpm, url, fechas, mejor score
└── songs/<id>/
    ├── audio.<ext>        # audio descargado por yt-dlp
    ├── beatmap.json       # onsets, bpm, secuencias generadas
    └── cover.jpg          # miniatura (opcional)
```

Reglas:

- **`<id>` es el ID del video de YouTube, sanitizado.** Nunca el título — un título puede
  traer `../`, separadores de ruta o nombres reservados de Windows. Ese id es también la
  clave de deduplicación.
- `library.json` es un **índice**, no la fuente de verdad del contenido. Si una entrada
  apunta a una carpeta que no existe, se marca como rota y se ofrece reprocesar. No se
  asume que el disco está intacto.
- La escritura del índice es **atómica**: se escribe a un temporal y se renombra. Un corte
  a mitad de escritura no puede dejar la biblioteca ilegible.
- El esquema de `library.json` lleva un campo `version` desde el día uno. Migrar después es
  mucho más caro que preverlo ahora.
- Borrar una canción borra la carpeta **y** la entrada del índice.

### Log

La app escribe a `<app_log_dir>/space-x-type.log`, **también en release**. En Windows eso es
`%LOCALAPPDATA%\com.xiza73.spacextype\logs\`.

No es un lujo: el detalle de los errores —incluido el `stderr` de `yt-dlp`— va al log y **no**
al usuario, porque puede filtrar rutas del sistema y no le dice nada útil a nadie. Sin log en
producción ese detalle no va a ningún lado y un fallo queda sin causa averiguable. Pasó: un
403 de YouTube se veía en la UI como "no se pudo descargar el audio" y la causa real solo
estaba en el log de desarrollo.

Se acota a 512 KB con una sola rotación. Es para diagnosticar lo último que pasó, no un
historial.

Sin base de datos. Un índice JSON alcanza para una biblioteca personal de decenas o
centenares de canciones; se evalúa SQLite solo si el escaneo lineal llega a molestar.

## Reglas de trabajo con Claude

**Hacer**
- Entender el concepto antes de escribir código. Si la mecánica de timing no está clara, se
  pregunta — no se improvisa.
- Proponer la solución más simple que funcione. Si la stdlib o una API nativa lo resuelve,
  no se agrega una dependencia.
- Verificar antes de afirmar. Si no estás seguro de una API, la lees.
- Marcar los atajos deliberados con un comentario que nombre el techo y el camino de salida.

**No hacer**
- **No correr builds** después de cambiar código salvo que se pida explícitamente.
- No agregar dependencias sin justificarlas contra la alternativa nativa.
- No crear abstracciones especulativas: nada de interfaces con una sola implementación.
- No tocar el reloj de timing sin entender por qué es `audioContext.currentTime`.
- No commitear sin pasar el gate de lint + tests.
- No agregar `Co-Authored-By` ni atribución de IA a los commits.

**Git**
- Rama de integración: **`dev`** (default). `master` recibe PRs solo desde `dev`.
- Ramas: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`.
- Commits: **Conventional Commits**, subject en imperativo, minúscula, sin punto final, ≤72 chars.
- Merge con `--no-ff`. Nunca squash, nunca rebase sobre el target.
- Skills aplicables: `git-flow` (política), `github-pr` (sintaxis `gh`), `delivery-handoff` (ritual de entrega).

**Skills a cargar según contexto:** `tauri-v2`, `react-19`, `typescript`, `tailwind-4`,
`zustand-5`, `vitest`, `web-audio`.
