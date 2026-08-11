# space-type-rythm

## Contexto del proyecto

Juego de ritmo + mecanografía para escritorio, inspirado en la mecánica de **Audition**:
una barra horizontal avanza a velocidad constante y sobre ella aparece una secuencia de
inputs que hay que **tipear** antes de confirmar con la **barra espaciadora** dentro de la
ventana de timing correcta.

Diferencias con el original: sin baile, sin avatares, sin social. Entrás y jugás.

Dos aportes propios:

1. **Modo palabras** — además de secuencias de flechas, la secuencia puede ser una palabra
   real en español o inglés (bibliotecas de palabras embebidas).
2. **Procesador musical** — le pasás una URL de YouTube, el sistema descarga el audio,
   detecta BPM/onsets y genera un beatmap que dura toda la partida. El fondo puede ser el
   video original con baja opacidad o visuales psicodélicos generativos.
3. **Biblioteca personal** — cada canción procesada se guarda en el disco. Al entrar,
   elegís una de tu biblioteca o procesás una nueva. Procesar es una operación de **una sola
   vez** por canción, no un paso previo a cada partida.

**Uso personal.** No hay usuarios externos ni distribución pública del contenido musical.

## Usuarios y alcance (MVP)

Usuario objetivo: el autor. Un jugador, offline, en su propia máquina.

MVP — en este orden:

1. Loop de gameplay con **flechas** (↑↓←→) sobre barra que avanza + confirmación con espacio.
2. Ventanas de timing y scoring (perfect / good / miss) con combo.
3. **Modo palabras** (es/en) reusando el mismo motor de secuencias.
4. Pipeline de audio: URL de YouTube → `yt-dlp` → archivo local → BPM → beatmap.
5. **Biblioteca personal**: persistir la canción procesada y poder elegirla al entrar.
6. Fondo psicodélico en canvas. El video de YouTube como fondo queda para después.

**Fuera del MVP:** multijugador, cuentas, leaderboards online, editor de beatmaps, móvil.

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
| Bundler | **Vite** | Estándar de Tauri v2 |

**Requisito externo:** `yt-dlp` debe estar en el `PATH`.

## Comandos clave

```bash
bun install               # instalar dependencias
bun run tauri dev         # dev — app + hot reload
bun run tauri build       # build de producción (binario nativo)
bun run test              # tests del frontend (Vitest)
bun run typecheck         # tsc --noEmit
bun run lint              # ESLint
cargo test  --manifest-path src-tauri/Cargo.toml    # tests del core Rust
cargo clippy --manifest-path src-tauri/Cargo.toml   # lint del core Rust
cargo fmt   --manifest-path src-tauri/Cargo.toml    # formato Rust
```

**Bun es el único package manager.** Nada de `npm` ni `pnpm`: no se commitea
`package-lock.json` ni `pnpm-lock.yaml`, solo `bun.lock`.

Gate antes de commitear: `bun run typecheck && bun run lint && bun run test` y, si tocaste
Rust, `cargo clippy` + `cargo test`.

## Convenciones de código

**TypeScript**
- `strict: true`. Nada de `any` — si no sabés el tipo, `unknown` y estrechá.
- Tipos derivados, no duplicados: `type X = typeof algo` antes de reescribir a mano.
- Sin default exports salvo que la herramienta lo exija.

**React**
- React 19 con compiler: **no** metas `useMemo`/`useCallback` a mano.
- Container / presentational: el componente que sabe *de dónde* vienen los datos no es el
  que sabe *cómo* se ven.
- El game loop **no vive en React**. Corre en un módulo propio con `rAF` y solo publica
  snapshots al store.

**Timing (crítico)**
- El reloj maestro es **`audioContext.currentTime`**. Nunca `Date.now()` ni `performance.now()`
  para lógica de juego — derivan del audio y arruinan la sincronía.
- Las ventanas de timing se expresan en **milisegundos**, en un solo módulo de constantes.

**Rust**
- Errores con `Result` + `thiserror`. Nada de `unwrap()` en código que corre en producción.
- Los comandos de Tauri son finos: validan y delegan a un módulo de dominio testeable.

**Nombres**
- Archivos: `kebab-case.ts`. Componentes React: `PascalCase`. Tipos: `PascalCase`.
- Módulos Rust: `snake_case`.

**Tests**
- Se testea la lógica: scoring, ventanas de timing, generación de secuencias, parseo de
  beatmaps. No se testea el canvas pixel a pixel.

## Estructura del repositorio

Single-package (no monorepo): un frontend + un core Rust, versionados juntos.

```
├── src/                      # frontend (React + TS)
│   ├── game/                 # motor: loop, timing, scoring, input — SIN React
│   ├── audio/                # Web Audio, reloj maestro, reproducción
│   ├── library/              # tipos y cliente de la biblioteca personal
│   ├── components/           # UI React (menús, HUD, settings)
│   ├── stores/               # Zustand
│   └── data/words/           # bibliotecas de palabras es/en
├── src-tauri/                # core Rust
│   ├── src/commands/         # comandos expuestos al frontend
│   ├── src/audio/            # yt-dlp, decodificación, detección de BPM
│   ├── src/library/          # índice, lectura/escritura, integridad
│   └── tauri.conf.json
└── .claude/                  # commands, skills, agents
```

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

Sin base de datos. Un índice JSON alcanza para una biblioteca personal de decenas o
centenares de canciones; se evalúa SQLite recién si el escaneo lineal llega a molestar.

## Reglas de trabajo con Claude

**Hacer**
- Entender el concepto antes de escribir código. Si la mecánica de timing no está clara, se
  pregunta — no se improvisa.
- Proponer la solución más simple que funcione. Si la stdlib o una API nativa lo resuelve,
  no se agrega una dependencia.
- Verificar antes de afirmar. Si no estás seguro de una API, la leés.
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
