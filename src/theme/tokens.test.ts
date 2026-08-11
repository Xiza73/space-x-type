import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { COLORS } from './tokens'

/**
 * La paleta vive en dos lugares por necesidad: `index.css` para la UI (Tailwind
 * genera las clases) y `tokens.ts` para el canvas (que no puede usar clases).
 *
 * Este test es lo que hace que esa duplicación sea segura. Sin él, alguien
 * cambia un acento en un archivo, se olvida del otro, y el juego queda con dos
 * magentas distintos según dónde mires.
 */

// Se lee el archivo en crudo a propósito: `import '../index.css?raw'` devuelve
// string vacío porque el plugin de Tailwind intercepta los .css antes que Vite.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

function cssColors(): Record<string, string> {
  // `[^{]*` tolera los modificadores del bloque (`@theme static`, `@theme inline`).
  const theme = /@theme[^{]*\{([\s\S]*?)\n\}/.exec(css)
  if (theme === null) throw new Error('no se encontró el bloque @theme en index.css')

  const out: Record<string, string> = {}
  for (const [, name, hex] of theme[1].matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    const key = name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
    out[key] = hex.toLowerCase()
  }
  return out
}

describe('paleta CSS ↔ TypeScript', () => {
  const fromCss = cssColors()

  it('encuentra tokens en index.css', () => {
    expect(Object.keys(fromCss).length).toBeGreaterThan(10)
  })

  it('define exactamente los mismos nombres en los dos lados', () => {
    expect(Object.keys(fromCss).sort()).toEqual(Object.keys(COLORS).sort())
  })

  it('les da exactamente el mismo valor', () => {
    expect(fromCss).toEqual(COLORS)
  })
})
