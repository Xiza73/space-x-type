/**
 * Junta el audio del banco de tempo en una carpeta aparte.
 *
 * El banco necesita canciones de verdad —las señales sintéticas fijan
 * propiedades pero no calibran— y necesita **muchas**, o cualquier ajuste vuelve
 * a ser curve-fitting contra cuatro casos.
 *
 * No escribe en la biblioteca del usuario. Va a `bench/audio/`, que está en el
 * `.gitignore`: son decenas de MB de audio con derechos, no entran al repo.
 *
 *   bun run bench:fetch
 *
 * Lo que ya está no se vuelve a bajar. Las canciones que la biblioteca del
 * usuario ya tiene se copian de ahí en vez de descargarse de nuevo.
 */

import { mkdir, readdir, copyFile, access, writeFile, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const DESTINO = 'src-tauri/bench/audio'
const MANIFIESTO = 'src-tauri/bench/tempos.tsv'
const PENDIENTES = 'src-tauri/bench/pendientes.tsv'

/** La biblioteca del usuario, para no rebajar lo que ya tiene. */
const BIBLIOTECA = join(process.env.APPDATA ?? '', 'com.xiza73.spacextype', 'songs')

/**
 * Los mismos runtimes que le pasa la app.
 *
 * **Sin esto YouTube devuelve 403.** Exige resolver un desafío en JavaScript
 * para firmar la URL del stream, y yt-dlp solo habilita `deno` por defecto.
 */
const RUNTIMES = ['deno', 'node', 'bun', 'quickjs']

function ytdlp(args) {
  const flags = []
  for (const r of RUNTIMES) flags.push('--js-runtimes', r)
  return spawnSync('yt-dlp', ['--no-playlist', '--no-progress', ...flags, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}

async function existe(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Las entradas del manifiesto, que es la fuente de verdad de qué se mide. */
async function manifiesto() {
  const raw = await readFile(MANIFIESTO, 'utf8')
  return raw
    .split('\n')
    .filter((l) => l.trim() && !l.trimStart().startsWith('#'))
    .map((l) => {
      const [id, bpm, grupo, titulo] = l.split('\t')
      return { id: id.trim(), bpm: bpm.trim(), grupo: grupo.trim(), titulo: (titulo ?? '').trim() }
    })
}

/** Canciones nuevas a resolver: `búsqueda <TAB> bpm <TAB> grupo <TAB> título`. */
async function pendientes() {
  if (!(await existe(PENDIENTES))) return []
  const raw = await readFile(PENDIENTES, 'utf8')
  return raw
    .split('\n')
    .filter((l) => l.trim() && !l.trimStart().startsWith('#'))
    .map((l) => {
      const [busqueda, bpm, grupo, titulo] = l.split('\t')
      return { busqueda: busqueda.trim(), bpm: bpm.trim(), grupo: grupo.trim(), titulo: titulo.trim() }
    })
}

await mkdir(DESTINO, { recursive: true })

// 1. Lo que ya está en la biblioteca del usuario se copia. Bajarlo de nuevo
//    sería tráfico y tiempo por algo que ya está en el disco.
for (const { id, titulo } of await manifiesto()) {
  const carpeta = join(DESTINO, id)
  const yaEsta = (await existe(carpeta)) && (await readdir(carpeta)).some((f) => f.startsWith('audio'))
  if (yaEsta) continue

  const origen = join(BIBLIOTECA, id)
  const audio = (await existe(origen)) ? (await readdir(origen)).find((f) => f.startsWith('audio')) : null

  if (audio) {
    await mkdir(carpeta, { recursive: true })
    await copyFile(join(origen, audio), join(carpeta, audio))
    console.log(`copiada   ${titulo}`)
    continue
  }

  console.log(`bajando   ${titulo}`)
  const r = ytdlp(['-f', 'bestaudio[ext=m4a]/bestaudio', '-o', join(carpeta, 'audio.%(ext)s'), '--', id])
  if (r.status !== 0) console.error(`  FALLÓ ${titulo}: ${(r.stderr ?? '').trim().split('\n').pop()}`)
}

// 2. Las pendientes no tienen id todavía: se resuelven por búsqueda y se
//    agregan al manifiesto con el id ya fijo. Fijarlo importa — una búsqueda
//    puede devolver otra versión mañana, y entonces el banco mediría otra cosa.
const nuevas = []
for (const { busqueda, bpm, grupo, titulo } of await pendientes()) {
  const buscar = ytdlp(['--print', '%(id)s\t%(duration)s\t%(title)s', `ytsearch1:${busqueda}`])
  const linea = (buscar.stdout ?? '').trim().split('\n').pop() ?? ''
  const [id, duracion, tituloReal] = linea.split('\t')

  if (!id || id.length !== 11) {
    console.error(`  SIN RESULTADO para "${busqueda}"`)
    continue
  }

  // El título que devolvió YouTube se imprime a propósito: si la búsqueda cayó
  // en un cover o un vivo, el tempo real es otro y la verdad de campo queda
  // envenenada. Mejor verlo que confiar.
  console.log(`resuelta  ${titulo}  ->  ${id}  (${duracion}s)  "${tituloReal}"`)

  const carpeta = join(DESTINO, id)
  const r = ytdlp(['-f', 'bestaudio[ext=m4a]/bestaudio', '-o', join(carpeta, 'audio.%(ext)s'), '--', id])
  if (r.status !== 0) {
    console.error(`  FALLÓ la descarga: ${(r.stderr ?? '').trim().split('\n').pop()}`)
    continue
  }
  nuevas.push(`${id}\t${bpm}\t${grupo}\t${titulo}`)
}

if (nuevas.length) {
  await writeFile(MANIFIESTO, (await readFile(MANIFIESTO, 'utf8')).trimEnd() + '\n' + nuevas.join('\n') + '\n')
  console.log(`\n${nuevas.length} entradas agregadas al manifiesto.`)
}
