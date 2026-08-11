# Convenciones de código

## TypeScript

- `strict: true`. Nada de `any` — si no sabés el tipo, `unknown` y estrechá.
- Tipos derivados, no duplicados: `type X = typeof algo` antes de reescribir a mano.
- Sin default exports salvo que la herramienta lo exija.

## React

- React 19 con compiler: **no** metas `useMemo`/`useCallback` a mano.
- Container / presentational: el componente que sabe *de dónde* vienen los datos no es el que
  sabe *cómo* se ven.
- El game loop **no vive en React**. Corre en un módulo propio con `rAF` y solo publica
  snapshots al store.

## Timing (crítico)

- El reloj maestro es **`audioContext.currentTime`**. Nunca `Date.now()` ni
  `performance.now()` para lógica de juego — derivan del audio y arruinan la sincronía.
- Las ventanas de timing se expresan en **milisegundos**, en un solo módulo de constantes.
- El tiempo se calcula **absoluto** desde el reloj de audio. Nunca acumulando deltas frame a
  frame: el error se suma y para el minuto tres el juego está corrido.

Detalle completo de ventanas, scoring y progresión en `game-modes.md`.

## Estilos

- Tokens de color y tipografía en `@theme` de Tailwind 4. **Cero hex sueltos en componentes.**
- El canvas del gameplay lee los colores del mismo módulo de tokens que la UI.

Paleta y efectos en `design-system.md`.

## Rust

- Errores con `Result` + `thiserror`. Nada de `unwrap()` en código que corre en producción.
- Los comandos de Tauri son finos: validan y delegan a un módulo de dominio testeable.
- El trabajo pesado de CPU (decodificar, detectar BPM) no bloquea el hilo async.

## Nombres

- Archivos: `kebab-case.ts`. Componentes React: `PascalCase`. Tipos: `PascalCase`.
- Módulos Rust: `snake_case`.

## Tests

- Se testea la lógica: scoring, ventanas de timing, generación de secuencias, parseo de
  beatmaps, integridad de la biblioteca. **No** se testea el canvas pixel a pixel.
- Un test de timing usa un reloj inyectado, no el reloj real. Un test que depende de tiempo
  de pared es un test que va a fallar solo algún día.
