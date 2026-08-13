---
description: Revisión de código del diff actual — corrección, timing, simplicidad
argument-hint: "[ruta o rama a comparar — por defecto el diff sin commitear]"
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

Revisa los cambios en `$ARGUMENTS` (si está vacío, usa el diff sin commitear:
`git diff HEAD`).

## Alcance

Lee **solo** lo que cambió y lo mínimo que haga falta para entenderlo. No audites el repo entero.

## Qué buscar, en este orden

1. **Corrección** — ¿el código hace lo que dice? Casos borde, off-by-one, estados imposibles.
2. **Timing** (crítico en este proyecto)
   - ¿Se está usando `Date.now()` o `performance.now()` para lógica de juego?
     Eso es un **bug**: el reloj maestro es `audioContext.currentTime`.
   - ¿Hay trabajo pesado dentro del loop de `requestAnimationFrame`?
   - ¿Se asignan ventanas de timing con números mágicos en vez del módulo de constantes?
3. **React** — ¿estado del game loop metido en React? ¿`useMemo`/`useCallback` innecesarios
   (React 19 compiler ya lo hace)?
4. **TypeScript** — `any`, aserciones `as` que tapan un problema real, tipos duplicados.
5. **Rust** — `unwrap()`/`expect()` en caminos que corren en producción, errores tragados.
6. **Simplicidad** — abstracción con una sola implementación, dependencia nueva que la
   stdlib o una API nativa ya resolvía, código muerto.
7. **Tests** — ¿la lógica nueva (scoring, timing, parseo) quedó sin una prueba que falle
   si se rompe?

## Formato de salida

Una línea por hallazgo, ordenadas de más grave a menos:

```
[GRAVEDAD] archivo:línea — qué está mal → qué hacer
```

Gravedad: `CRÍTICO` (rompe o corrompe) · `IMPORTANTE` (deuda real) · `SUGERENCIA` (mejora).

Si no hay nada que reportar, dilo en una línea. **No inventes hallazgos para llenar.**
No apliques los cambios salvo que se te pida.
