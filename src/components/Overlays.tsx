/**
 * Capas decorativas de pantalla completa: scanlines y viñeta.
 * Nunca interceptan clicks ni teclado — son puro adorno.
 */
export function Overlays() {
  return (
    <>
      <div className="vignette" />
      <div className="scanlines" />
    </>
  )
}
