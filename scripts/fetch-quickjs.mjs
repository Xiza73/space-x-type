/**
 * Baja el binario de QuickJS que Tauri empaqueta como sidecar.
 *
 * No se commitea al repo: son 1–2 MB por plataforma, cambian de versión y un
 * binario versionado es algo que nadie vuelve a mirar. Se baja al construir.
 *
 * Tauri exige que el archivo se llame `<nombre>-<target triple>`, y al empaquetar
 * le saca el sufijo. Por eso el nombre del asset de quickjs-ng —que usa otra
 * convención— se traduce aquí.
 *
 *   bun run tools            # la plataforma actual
 *   bun run tools <triple>   # una en particular, para el CI
 */

import { mkdir, writeFile, chmod, access } from 'node:fs/promises'
import { execSync } from 'node:child_process'

/** Fijada a propósito: que el build sea reproducible y no dependa del día. */
const VERSION = 'v0.16.1'

/** Cómo llama quickjs-ng a su binario para cada target de Rust. */
const ASSETS = {
  'x86_64-pc-windows-msvc': 'qjs-windows-x86_64.exe',
  'aarch64-pc-windows-msvc': 'qjs-windows-x86_64.exe',
  'x86_64-apple-darwin': 'qjs-darwin-x86_64',
  'aarch64-apple-darwin': 'qjs-darwin-arm64',
  'x86_64-unknown-linux-gnu': 'qjs-linux-x86_64',
  'aarch64-unknown-linux-gnu': 'qjs-linux-aarch64',
}

const triple = process.argv[2] ?? execSync('rustc --print host-tuple').toString().trim()
const asset = ASSETS[triple]

if (asset === undefined) {
  console.error(`No hay QuickJS publicado para ${triple}.`)
  console.error(`Conocidos: ${Object.keys(ASSETS).join(', ')}`)
  process.exit(1)
}

const destino = `src-tauri/binaries/qjs-${triple}${triple.includes('windows') ? '.exe' : ''}`

// Si ya está, no se vuelve a bajar: esto corre en cada build.
try {
  await access(destino)
  console.log(`QuickJS ya está en ${destino}`)
  process.exit(0)
} catch {
  // No está: se baja.
}

const url = `https://github.com/quickjs-ng/quickjs/releases/download/${VERSION}/${asset}`
console.log(`Bajando ${asset} (${VERSION}) para ${triple}…`)

const respuesta = await fetch(url)
if (!respuesta.ok) {
  console.error(`Falló la descarga: ${respuesta.status} ${respuesta.statusText}`)
  console.error(url)
  process.exit(1)
}

await mkdir('src-tauri/binaries', { recursive: true })
await writeFile(destino, Buffer.from(await respuesta.arrayBuffer()))
// En Unix un archivo escrito no nace ejecutable.
if (!triple.includes('windows')) await chmod(destino, 0o755)

console.log(`Listo: ${destino}`)
