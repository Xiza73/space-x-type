//! Detección de tempo y generación del beatmap.
//!
//! El pipeline es: decodificar → función de novedad → BPM por autocorrelación →
//! fase del primer beat. Las tres etapas de DSP son **puras y toman `&[f32]`**,
//! así que se testean con señales sintéticas de tempo conocido, sin archivos.

use std::path::Path;

use serde::{Deserialize, Serialize};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::probe::Hint;

use super::store::LibraryError;

/// Ventana y salto del análisis, en muestras. Con salto 512 a 44.1 kHz quedan
/// ~86 cuadros por segundo: sobra para resolver tempo.
const FRAME: usize = 1024;
const HOP: usize = 512;

/// Rango de tempo que se busca. Fuera de aquí se dobla o se parte a la mitad:
/// una canción de 60 BPM se detecta como 120, y para el juego está bien.
///
/// Adentro del rango, elegir entre un tempo y su mitad lo decide
/// `octave_weight`, no la autocorrelación sola — que no puede.
const MIN_BPM: f32 = 70.0;
const MAX_BPM: f32 = 180.0;

/// Cuántos beats dura una ronda mientras el jugador no elija otra cosa.
///
/// Es un **default**, no una decisión del análisis. Antes el análisis elegía
/// entre 2, 4 y 8 buscando acercarse a una duración objetivo, o sea que
/// cancelaba el tempo en vez de seguirlo: con solo tres opciones la relación
/// entre BPM y velocidad quedaba con dos saltos, y en 80 y en 155 BPM subir el
/// tempo hacía la barra casi el doble de **lenta**.
///
/// Con los beats fijos la relación es monótona y el tempo vuelve a significar
/// algo. La velocidad pasó a ser una preferencia del jugador, que es lo que
/// siempre fue.
pub const DEFAULT_BEATS_PER_ROUND: u32 = 4;

/// RMS por debajo del cual una ventana cuenta como silencio (~-40 dBFS).
///
/// El piso de ruido de un audio real anda por 0.001; un fundido todavía audible
/// no baja de 0.01. El umbral va justo en el medio.
const SILENCE_RMS: f32 = 0.01;

/// Ventana con la que se mide el silencio, en ms.
///
/// Media segundo, y no unas pocas muestras, **porque un pico suelto tiene que
/// perderse en el promedio**. Una muestra de 0.9 en media ventana da un RMS de
/// 0.006 y queda debajo del umbral; en una ventana de 512 muestras daría 0.04 y
/// se llevaría puesto el recorte entero. Hay un test que lo fija.
const SILENCE_WINDOW_MS: u32 = 500;

/// Cola de silencio que se conserva.
///
/// Cortar seco en el último golpe se siente a que la app se colgó, no a que la
/// canción terminó.
const TAIL_MS: u32 = 2000;

/// Cuánto silencio de más tiene que haber para que valga la pena recortar.
///
/// Un final con dos o tres segundos de aire se deja como está: el recorte es
/// para las pantallas finales de YouTube, que son de decenas de segundos.
const MIN_TRIM_MS: u32 = 3000;

pub const BEATMAP_VERSION: u32 = 1;
pub const BEATMAP_FILE: &str = "beatmap.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Beatmap {
    pub version: u32,
    pub bpm: f32,
    /// Dónde cae el primer beat, en ms desde el arranque del audio.
    pub first_beat_ms: u32,
    pub duration_ms: u32,
    /// Cuántos beats dura una ronda.
    pub beats_per_round: u32,
    /// Derivado, pero se guarda para que el frontend no repita la cuenta.
    pub round_duration_ms: u32,
}

/// Límites duros para una corrección manual del tempo.
pub const MIN_BPM_EDIT: f32 = 40.0;
pub const MAX_BPM_EDIT: f32 = 240.0;

/// Rango sugerido para corregir a mano, alrededor del detectado.
///
/// Va de la mitad al doble porque el fallo típico de la detección automática es
/// el error de octava: un tema de 75 se detecta como 150 y viceversa.
pub fn suggested_range(detected: f32) -> (f32, f32) {
    (
        (detected / 2.0).max(MIN_BPM_EDIT),
        (detected * 2.0).min(MAX_BPM_EDIT),
    )
}

pub fn clamp_bpm(bpm: f32) -> f32 {
    bpm.clamp(MIN_BPM_EDIT, MAX_BPM_EDIT)
}

/// Rearma el beatmap con otro tempo, recalculando lo que depende de él.
///
/// El `firstBeatMs` no se toca: dónde empieza el primer golpe es una medición
/// del audio, independiente de a qué velocidad se cuente después.
pub fn with_bpm(beatmap: &Beatmap, bpm: f32) -> Beatmap {
    let bpm = clamp_bpm(bpm);
    // Los beats por ronda NO se recalculan: son la velocidad, y la velocidad no
    // es asunto del tempo. Recalcularlos es exactamente lo que hacía que
    // corregir el tempo moviera la barra para cualquier lado.
    let beats_per_round = beatmap.beats_per_round.max(1);
    Beatmap {
        bpm,
        beats_per_round,
        round_duration_ms: (beats_per_round as f32 * 60_000.0 / bpm) as u32,
        ..beatmap.clone()
    }
}

/// Analiza un archivo de audio y arma su beatmap.
pub fn analyze(path: &Path) -> Result<Beatmap, LibraryError> {
    let (samples, sample_rate) = decode(path)?;
    Ok(build_beatmap(&samples, sample_rate))
}

/// La parte pura: de muestras a beatmap. Separada de la decodificación para
/// poder testearla con señales generadas.
pub fn build_beatmap(samples: &[f32], sample_rate: u32) -> Beatmap {
    let frames_per_sec = sample_rate as f32 / HOP as f32;
    let novelty = novelty(samples, FRAME, HOP);

    let bpm = estimate_bpm(&novelty, frames_per_sec);
    let first_beat_sec = estimate_first_beat(&novelty, frames_per_sec, bpm);
    let duration_ms = useful_duration_ms(samples, sample_rate);

    let beats_per_round = DEFAULT_BEATS_PER_ROUND;
    let round_duration_ms = (beats_per_round as f32 * 60_000.0 / bpm) as u32;

    Beatmap {
        version: BEATMAP_VERSION,
        bpm,
        first_beat_ms: (first_beat_sec * 1000.0) as u32,
        duration_ms,
        beats_per_round,
        round_duration_ms,
    }
}

/// Función de novedad por energía: cuánto **subió** el nivel respecto del
/// cuadro anterior.
///
/// La compresión logarítmica no es adorno: sin ella, un tema masterizado fuerte
/// aplasta las diferencias y los golpes dejan de destacarse.
///
/// ponytail: es un detector por energía, no por flujo espectral. Anda bien con
/// música percusiva, que es toda la que va a entrar aquí. Si algún día falla con
/// temas suaves, el camino de salida es una FFT y flujo espectral por banda.
pub fn novelty(samples: &[f32], frame: usize, hop: usize) -> Vec<f32> {
    const COMPRESSION: f32 = 100.0;

    let mut out = Vec::new();
    let mut previous = 0.0f32;
    let mut start = 0usize;

    while start + frame <= samples.len() {
        let energy: f32 =
            samples[start..start + frame].iter().map(|s| s * s).sum::<f32>() / frame as f32;
        let level = (1.0 + energy.sqrt() * COMPRESSION).ln();

        out.push((level - previous).max(0.0));
        previous = level;
        start += hop;
    }

    out
}

/// Tempo por autocorrelación de la función de novedad.
///
/// Se le resta la media antes de correlacionar: si no, el término constante
/// domina y el pico se pierde.
pub fn estimate_bpm(novelty: &[f32], frames_per_sec: f32) -> f32 {
    if novelty.len() < 16 {
        return 120.0;
    }

    let mean = novelty.iter().sum::<f32>() / novelty.len() as f32;
    let centered: Vec<f32> = novelty.iter().map(|v| v - mean).collect();

    let min_lag = (60.0 * frames_per_sec / MAX_BPM).round().max(1.0) as usize;
    let max_lag = ((60.0 * frames_per_sec / MIN_BPM).round() as usize).min(centered.len() / 2);
    if min_lag >= max_lag {
        return 120.0;
    }

    let mut best_lag = min_lag;
    let mut best_score = f32::MIN;

    for lag in min_lag..=max_lag {
        let overlap = centered.len() - lag;

        // Se divide por el largo TOTAL, no por el solapamiento. Dividir por el
        // solapamiento —que se achica a medida que crece el lag— infla el
        // puntaje de los lags largos, o sea que el estimador queda sesgado
        // hacia los tempos lentos por pura aritmética.
        let r = (0..overlap).map(|i| centered[i] * centered[i + lag]).sum::<f32>()
            / centered.len() as f32;

        let weighted = r * octave_weight(60.0 * frames_per_sec / lag as f32);
        if weighted > best_score {
            best_score = weighted;
            best_lag = lag;
        }
    }

    60.0 * frames_per_sec / best_lag as f32
}

/// Tempo que se prefiere cuando hay que desempatar entre octavas.
const PREFERRED_BPM: f32 = 121.0;
/// Ancho de la preferencia, en logaritmos. Más chico = más terco con el valor.
///
/// **Estos dos números salieron de un barrido, no de una corazonada.** El test
/// `barrido::buscar_parametros` recorre el plano (preferido, ancho) contra todas
/// las señales de prueba y devuelve el par con más aciertos. Cuando una canción
/// real salga mal, se agrega como caso y se vuelve a correr.
const PREFERRED_SPREAD: f32 = 0.32;

/// Peso perceptual del tempo, para resolver el **error de octava**.
///
/// Un tren de pulsos a 150 BPM se autocorrelaciona igual de bien a 75: cada dos
/// golpes también hay un período. La matemática sola no puede elegir, y sin un
/// criterio extra el estimador devolvía la mitad del tempo real — que era
/// jugable mientras la velocidad de la barra se elegía aparte, y dejó de serlo
/// cuando el BPM pasó a ser la velocidad.
///
/// El criterio es el mismo que usa una persona al marcar el pulso con el pie:
/// entre dos tempos que encajan, se elige el más cercano a ~125 BPM. Es una
/// campana en escala logarítmica, porque las octavas son multiplicativas: 60 y
/// 240 están igual de lejos de 120.
fn octave_weight(bpm: f32) -> f32 {
    let distance = (bpm / PREFERRED_BPM).ln() / PREFERRED_SPREAD;
    (-0.5 * distance * distance).exp()
}

/// Fase del primer beat: el desplazamiento que hace que un tren de pulsos al
/// tempo detectado caiga sobre la mayor cantidad de energía.
pub fn estimate_first_beat(novelty: &[f32], frames_per_sec: f32, bpm: f32) -> f32 {
    let period = 60.0 * frames_per_sec / bpm;
    if period < 1.0 || novelty.is_empty() {
        return 0.0;
    }

    let mut best_offset = 0usize;
    let mut best_score = f32::MIN;

    for offset in 0..period.round() as usize {
        let mut position = offset as f32;
        let mut score = 0.0;
        while (position as usize) < novelty.len() {
            score += novelty[position as usize];
            position += period;
        }
        if score > best_score {
            best_score = score;
            best_offset = offset;
        }
    }

    best_offset as f32 / frames_per_sec
}

/// Cuánto dura la canción **para el juego**: hasta el último sonido, más `TAIL_MS`.
///
/// Los videos de YouTube suelen terminar con pantallas finales, silencio o un
/// fundido larguísimo. Sin recortar eso, la partida sigue corriendo sobre la nada
/// y el jugador tipea contra el vacío hasta que se acaba el tiempo.
///
/// **No se toca el archivo de audio**, solo la duración que se anota en el
/// beatmap. Recortar el audio sería destructivo y no haría falta para nada: lo
/// que necesita el juego es saber cuándo dejar de contar.
pub fn useful_duration_ms(samples: &[f32], sample_rate: u32) -> u32 {
    let total_ms = ms_at(samples.len(), sample_rate);

    let window = (sample_rate as usize * SILENCE_WINDOW_MS as usize / 1000).max(1);
    let last_loud = samples.chunks(window).rposition(|w| {
        let sum: f32 = w.iter().map(|s| s * s).sum();
        (sum / w.len() as f32).sqrt() > SILENCE_RMS
    });

    // Todo silencio. No hay recorte que no deje la canción en cero, así que se
    // devuelve entera y que el usuario decida si la borra.
    let Some(block) = last_loud else {
        return total_ms;
    };

    let sound_end_ms = ms_at((block + 1) * window, sample_rate).min(total_ms);
    let trimmed = sound_end_ms + TAIL_MS;

    if total_ms.saturating_sub(trimmed) > MIN_TRIM_MS {
        trimmed
    } else {
        total_ms
    }
}

fn ms_at(sample_index: usize, sample_rate: u32) -> u32 {
    (sample_index as f32 / sample_rate as f32 * 1000.0) as u32
}

/// Decodifica a mono `f32`.
///
/// Se baja a mono en el mismo pase para no tener dos copias del tema en memoria.
fn decode(path: &Path) -> Result<(Vec<f32>, u32), LibraryError> {
    let file = std::fs::File::open(path)?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, stream, &Default::default(), &Default::default())
        .map_err(|e| {
            log::error!("no se pudo identificar el audio: {e}");
            LibraryError::Analysis
        })?;

    let mut format = probed.format;
    let track = format.default_track().ok_or(LibraryError::Analysis)?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44_100);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &Default::default())
        .map_err(|e| {
            log::error!("no hay decodificador para el audio: {e}");
            LibraryError::Analysis
        })?;

    let mut mono = Vec::new();
    let mut buffer: Option<SampleBuffer<f32>> = None;

    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        let Ok(decoded) = decoder.decode(&packet) else {
            // Un paquete roto no tira abajo el análisis del tema entero.
            continue;
        };

        let spec = *decoded.spec();
        let channels = spec.channels.count().max(1);
        let buf = buffer.get_or_insert_with(|| SampleBuffer::new(decoded.capacity() as u64, spec));
        buf.copy_interleaved_ref(decoded);

        for frame in buf.samples().chunks(channels) {
            mono.push(frame.iter().sum::<f32>() / channels as f32);
        }
    }

    if mono.is_empty() {
        return Err(LibraryError::Analysis);
    }

    Ok((mono, sample_rate))
}

#[cfg(test)]
pub mod tests_support {
    pub use super::tests::{backbeat_track as backbeat, ballad_track as ballad, click_track as click};
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 44_100;

    /// Pista de clicks a un tempo conocido: la forma de testear DSP sin
    /// archivos ni fixtures.
    pub fn click_track(bpm: f32, seconds: f32, offset_sec: f32) -> Vec<f32> {
        let total = (seconds * SR as f32) as usize;
        let mut out = vec![0.0f32; total];
        let period = 60.0 / bpm * SR as f32;
        let mut position = offset_sec * SR as f32;

        while (position as usize) < total {
            let start = position as usize;
            let len = 300.min(total - start);
            for k in 0..len {
                // Ataque seco y caída rápida, como un golpe percusivo.
                let decay = 1.0 - k as f32 / len as f32;
                out[start + k] = decay * decay * (k as f32 * 0.35).sin();
            }
            position += period;
        }

        out
    }

    #[test]
    fn la_novedad_se_prende_en_los_golpes() {
        let novelty = novelty(&click_track(120.0, 4.0, 0.0), FRAME, HOP);
        let max = novelty.iter().cloned().fold(0.0f32, f32::max);
        let mean = novelty.iter().sum::<f32>() / novelty.len() as f32;

        // Los picos tienen que sobresalir claramente del promedio.
        assert!(max > mean * 5.0, "max {max}, media {mean}");
    }

    #[test]
    fn la_novedad_de_silencio_es_plana() {
        let novelty = novelty(&vec![0.0f32; SR as usize], FRAME, HOP);
        assert!(novelty.iter().all(|v| *v == 0.0));
    }

    #[test]
    fn detecta_el_tempo_de_una_pista_de_clicks() {
        let frames_per_sec = SR as f32 / HOP as f32;

        for esperado in [90.0f32, 100.0, 120.0, 140.0, 160.0] {
            let novelty = novelty(&click_track(esperado, 30.0, 0.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (detectado - esperado).abs() < 2.5,
                "esperaba {esperado}, detectó {detectado}"
            );
        }
    }

    /// Patrón de bombo y caja: golpes fuertes y flojos alternados.
    ///
    /// Es como suena casi toda la música popular, y es **la trampa clásica del
    /// error de octava**: los golpes fuertes solos ya forman un pulso a la
    /// mitad del tempo, así que la autocorrelación encaja igual de bien ahí.
    pub fn backbeat_track(bpm: f32, seconds: f32) -> Vec<f32> {
        let total = (seconds * SR as f32) as usize;
        let mut out = vec![0.0f32; total];
        let period = 60.0 / bpm * SR as f32;

        let mut position = 0.0f32;
        let mut beat = 0usize;
        while (position as usize) < total {
            let start = position as usize;
            let len = 300.min(total - start);
            let strength = if beat % 2 == 0 { 1.0 } else { 0.35 };
            for k in 0..len {
                let decay = 1.0 - k as f32 / len as f32;
                out[start + k] = strength * decay * decay * (k as f32 * 0.35).sin();
            }
            position += period;
            beat += 1;
        }
        out
    }

    #[test]
    fn no_se_come_la_mitad_del_tempo_en_un_patron_con_acentos() {
        // El caso real que se rompió: una canción rápida se procesaba a 75 BPM.
        // Mientras la velocidad de la barra se elegía aparte no molestaba;
        // cuando el BPM pasó a ser la velocidad, quedó lentísima.
        let frames_per_sec = SR as f32 / HOP as f32;

        for esperado in [128.0f32, 140.0, 150.0, 160.0, 174.0] {
            let novelty = novelty(&backbeat_track(esperado, 30.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (detectado - esperado).abs() < 4.0,
                "esperaba {esperado}, detectó {detectado} (¿mitad de tempo?)"
            );
        }
    }

    #[test]
    fn la_preferencia_de_octava_es_simetrica_en_logaritmo() {
        // 60 y 250 tienen que estar igual de lejos de 125: las octavas son
        // multiplicativas, no aditivas. Si esto se hace lineal, la preferencia
        // se corre hacia los tempos rápidos y aparece el error al revés.
        let mitad = octave_weight(PREFERRED_BPM / 2.0);
        let doble = octave_weight(PREFERRED_BPM * 2.0);
        assert!((mitad - doble).abs() < 1e-6, "mitad {mitad}, doble {doble}");
        assert!(octave_weight(PREFERRED_BPM) > mitad);
        assert!((octave_weight(PREFERRED_BPM) - 1.0).abs() < 1e-6);
    }

    /// Balada: golpes en el beat y **corcheas más flojas en el medio**.
    ///
    /// Es la trampa del error de octava hacia arriba, y el caso que se rompió de
    /// verdad: "Somewhere Only We Know" —que va a unos 86 BPM— se procesó a
    /// 172.27, el doble exacto. Con la barra siguiendo al tempo, quedaba al
    /// doble de velocidad de lo que suena.
    pub fn ballad_track(bpm: f32, seconds: f32) -> Vec<f32> {
        let total = (seconds * SR as f32) as usize;
        let mut out = vec![0.0f32; total];
        let half = 30.0 / bpm * SR as f32;

        let mut position = 0.0f32;
        let mut step = 0usize;
        while (position as usize) < total {
            let start = position as usize;
            let len = 300.min(total - start);
            // Las corcheas suenan, pero bastante más flojas que el pulso.
            let strength = if step % 2 == 0 { 1.0 } else { 0.5 };
            for k in 0..len {
                let decay = 1.0 - k as f32 / len as f32;
                out[start + k] = strength * decay * decay * (k as f32 * 0.35).sin();
            }
            position += half;
            step += 1;
        }
        out
    }

    /// > **Límite conocido: abajo de ~84 BPM esto no se puede resolver.**
    /// > Una balada de 72 con corcheas y un tema de 144 con acentos alternados
    /// > son la *misma señal* —pulsos fuerte/flojo a 144 por minuto— con la
    /// > respuesta correcta invertida. Ninguna preferencia de tempo puede
    /// > acertarle a las dos, y no es un defecto de esta implementación: es
    /// > ambigüedad real. Para eso está la corrección manual en la biblioteca.
    #[test]
    fn no_dobla_el_tempo_de_una_balada_con_corcheas() {
        let frames_per_sec = SR as f32 / HOP as f32;

        for esperado in [86.0f32, 95.0, 110.0] {
            let novelty = novelty(&ballad_track(esperado, 40.0), FRAME, HOP);
            let detectado = estimate_bpm(&novelty, frames_per_sec);

            assert!(
                (detectado - esperado).abs() < 4.0,
                "esperaba {esperado}, detectó {detectado} (¿tempo al doble?)"
            );
        }
    }

    #[test]
    fn el_tempo_lento_de_verdad_sigue_saliendo_lento() {
        // La preferencia por 125 no puede convertirse en "todo es 125": una
        // balada tiene que salir lenta, o el ajuste habría cambiado un sesgo
        // por el opuesto.
        let frames_per_sec = SR as f32 / HOP as f32;
        let novelty = novelty(&click_track(80.0, 30.0, 0.0), FRAME, HOP);
        let detectado = estimate_bpm(&novelty, frames_per_sec);

        assert!((detectado - 80.0).abs() < 4.0, "detectó {detectado}");
    }

    #[test]
    fn encuentra_la_fase_del_primer_beat() {
        let frames_per_sec = SR as f32 / HOP as f32;
        let offset = 0.25;

        let novelty = novelty(&click_track(120.0, 30.0, offset), FRAME, HOP);
        let bpm = estimate_bpm(&novelty, frames_per_sec);
        let detectado = estimate_first_beat(&novelty, frames_per_sec, bpm);

        // Tolerancia de un cuadro y medio: la resolución del análisis.
        assert!(
            (detectado - offset).abs() < 1.5 / frames_per_sec,
            "esperaba {offset}s, detectó {detectado}s"
        );
    }

    #[test]
    fn no_revienta_con_una_señal_minuscula() {
        let beatmap = build_beatmap(&[0.0; 100], SR);
        assert!(beatmap.bpm > 0.0);
        assert!(beatmap.round_duration_ms > 0);
    }

    #[test]
    fn el_rango_sugerido_cubre_el_error_de_octava() {
        // El fallo típico de la detección: un tema de 75 se detecta como 150.
        let (min, max) = suggested_range(150.0);
        assert!(min <= 75.0 && max >= 240.0_f32.min(300.0));

        // Y nunca sale de los límites duros.
        let (min, max) = suggested_range(200.0);
        assert!(min >= MIN_BPM_EDIT && max <= MAX_BPM_EDIT);
    }

    #[test]
    fn la_correccion_recalcula_lo_que_depende_del_tempo() {
        let base = build_beatmap(&click_track(120.0, 10.0, 0.25), SR);
        let corregido = with_bpm(&base, 60.0);

        assert_eq!(corregido.bpm, 60.0);
        // Los beats por ronda son la VELOCIDAD y no se tocan al corregir el
        // tempo. A 60 BPM un beat dura 1000ms, así que cuatro dan 4000.
        assert_eq!(corregido.beats_per_round, base.beats_per_round);
        assert_eq!(corregido.round_duration_ms, 4000);
        // Lo que es medición del audio no se toca.
        assert_eq!(corregido.first_beat_ms, base.first_beat_ms);
        assert_eq!(corregido.duration_ms, base.duration_ms);
    }

    #[test]
    fn la_correccion_se_acota_a_los_limites() {
        let base = build_beatmap(&click_track(120.0, 5.0, 0.0), SR);

        assert_eq!(with_bpm(&base, 0.0).bpm, MIN_BPM_EDIT);
        assert_eq!(with_bpm(&base, 10_000.0).bpm, MAX_BPM_EDIT);
        // Un tempo de cero dividiría por cero al armar la grilla.
        assert!(with_bpm(&base, 0.0).round_duration_ms > 0);
    }

    #[test]
    fn mas_tempo_es_siempre_barra_mas_rapida() {
        // **El test que faltaba.** El modelo anterior elegía los beats por ronda
        // buscando una duración objetivo, y con solo tres opciones la relación
        // se daba vuelta: a 150 BPM la ronda duraba 1600ms y a 155 saltaba a
        // 3096ms. Subir el tempo hacía la barra casi el doble de lenta, y no
        // había forma de darse cuenta sin recorrer el rango entero.
        let base = build_beatmap(&click_track(120.0, 10.0, 0.0), SR);

        let mut anterior = u32::MAX;
        let mut bpm = MIN_BPM_EDIT;
        while bpm <= MAX_BPM_EDIT {
            let duracion = with_bpm(&base, bpm).round_duration_ms;
            assert!(
                duracion < anterior,
                "a {bpm} BPM la ronda dura {duracion}ms, y a un tempo menor duraba {anterior}ms"
            );
            anterior = duracion;
            bpm += 1.0;
        }
    }

    #[test]
    fn la_ronda_queda_jugable_en_todo_el_rango_de_tempo() {
        // Con la velocidad por defecto. Si esto falla, entrar a una canción sin
        // tocar nada da una partida injugable a algún tempo.
        for bpm in [70.0f32, 90.0, 120.0, 150.0, 180.0] {
            let beatmap = build_beatmap(&click_track(bpm, 20.0, 0.0), SR);
            assert!(
                (1200..=3600).contains(&beatmap.round_duration_ms),
                "a {bpm} BPM la ronda dura {}ms",
                beatmap.round_duration_ms
            );
        }
    }

    #[test]
    fn el_beatmap_reporta_la_duracion_del_audio() {
        let beatmap = build_beatmap(&click_track(120.0, 10.0, 0.0), SR);
        assert!((beatmap.duration_ms as i32 - 10_000).abs() < 100);
    }

    /// Música seguida de silencio, que es como termina medio YouTube.
    fn con_silencio_final(musica_sec: f32, silencio_sec: f32) -> Vec<f32> {
        let mut out = click_track(120.0, musica_sec, 0.0);
        out.extend(std::iter::repeat_n(0.0, (silencio_sec * SR as f32) as usize));
        out
    }

    #[test]
    fn recorta_el_silencio_largo_del_final() {
        // 10s de música y 20s de nada: la partida no puede durar 30s.
        let duracion = useful_duration_ms(&con_silencio_final(10.0, 20.0), SR);
        // Fin de la música a los 10s, más los 2s de cola.
        assert!(
            (duracion as i32 - 12_000).abs() < 600,
            "quedó en {duracion} ms"
        );
    }

    #[test]
    fn no_toca_un_final_con_dos_segundos_de_aire() {
        // El usuario lo pidió explícito: dos o tres segundos no son un problema.
        let samples = con_silencio_final(10.0, 2.0);
        let total = (samples.len() as f32 / SR as f32 * 1000.0) as u32;
        assert_eq!(useful_duration_ms(&samples, SR), total);
    }

    #[test]
    fn un_click_perdido_en_el_silencio_no_arruina_el_recorte() {
        // Por esto el umbral es de RMS por bloque y no por muestra: el piso de
        // ruido de un audio real tiene picos sueltos.
        let mut samples = con_silencio_final(10.0, 20.0);
        let perdido = (25.0 * SR as f32) as usize;
        samples[perdido] = 0.9;

        let duracion = useful_duration_ms(&samples, SR);
        assert!(duracion < 13_000, "el click se llevó el recorte: {duracion} ms");
    }

    #[test]
    fn un_audio_todo_en_silencio_se_devuelve_entero() {
        // Recortarlo lo dejaría en cero, o sea imposible de jugar. Mejor que
        // suene mudo y el usuario decida borrarlo.
        let samples = vec![0.0f32; SR as usize * 5];
        assert!(useful_duration_ms(&samples, SR) > 4_900);
    }

    #[test]
    fn el_recorte_nunca_se_pasa_del_audio_real() {
        // La cola se suma al último sonido, y el último sonido puede estar justo
        // al final: sin el `min` la canción diría durar más de lo que dura.
        let samples = click_track(120.0, 3.0, 0.0);
        let total = (samples.len() as f32 / SR as f32 * 1000.0) as u32;
        assert!(useful_duration_ms(&samples, SR) <= total);
    }

    /// WAV PCM 16 bits mono, escrito a mano. Es la forma de tener un archivo de
    /// audio real en un test sin meter un binario al repo.
    fn write_wav(path: &Path, samples: &[f32], sample_rate: u32) {
        const BYTES_PER_SAMPLE: u32 = 2;
        let data_len = samples.len() as u32 * BYTES_PER_SAMPLE;

        let mut out = Vec::with_capacity(44 + data_len as usize);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes()); // tamaño del chunk fmt
        out.extend_from_slice(&1u16.to_le_bytes()); // PCM sin comprimir
        out.extend_from_slice(&1u16.to_le_bytes()); // mono
        out.extend_from_slice(&sample_rate.to_le_bytes());
        out.extend_from_slice(&(sample_rate * BYTES_PER_SAMPLE).to_le_bytes());
        out.extend_from_slice(&(BYTES_PER_SAMPLE as u16).to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());

        for sample in samples {
            let value = (sample.clamp(-1.0, 1.0) * 32_767.0) as i16;
            out.extend_from_slice(&value.to_le_bytes());
        }

        std::fs::write(path, out).unwrap();
    }

    #[test]
    fn analiza_un_archivo_de_audio_de_verdad() {
        // Sin esto, la ruta de decodificación no la prueba nadie: el DSP anda
        // sobre `&[f32]` y symphonia queda sin cubrir.
        let dir = std::env::temp_dir().join("sxt-analysis-archivo");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("audio.wav");

        write_wav(&path, &click_track(120.0, 20.0, 0.0), SR);

        let beatmap = analyze(&path).unwrap();
        assert!((beatmap.bpm - 120.0).abs() < 2.5, "detectó {} BPM", beatmap.bpm);
        assert_eq!(beatmap.beats_per_round, 4);
        assert!((beatmap.duration_ms as i32 - 20_000).abs() < 200);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn un_archivo_que_no_es_audio_da_error_claro() {
        let dir = std::env::temp_dir().join("sxt-analysis-basura");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("audio.wav");
        std::fs::write(&path, b"esto no es audio").unwrap();

        assert!(matches!(analyze(&path), Err(LibraryError::Analysis)));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod barrido {
    use super::tests_support::*;
    use super::*;

    #[test]
    #[ignore]
    fn buscar_parametros() {
        let fps = 44_100.0 / HOP as f32;
        let casos: Vec<(f32, Vec<f32>)> = vec![
            (128.0, backbeat(128.0, 30.0)),
            (140.0, backbeat(140.0, 30.0)),
            (150.0, backbeat(150.0, 30.0)),
            (160.0, backbeat(160.0, 30.0)),
            (174.0, backbeat(174.0, 30.0)),
            (86.0, ballad(86.0, 40.0)),
            (95.0, ballad(95.0, 40.0)),
            (110.0, ballad(110.0, 40.0)),
            (80.0, click(80.0, 30.0, 0.0)),
            (105.0, click(105.0, 30.0, 0.0)),
            (120.0, click(120.0, 30.0, 0.0)),
        ];
        let novs: Vec<(f32, Vec<f32>)> =
            casos.iter().map(|(b, s)| (*b, novelty(s, FRAME, HOP))).collect();

        let mut mejor = (0usize, 0.0f32, 0.0f32, Vec::new());
        for pi in 0..40 {
            let pref = 95.0 + pi as f32 * 2.0;
            for si in 0..30 {
                let spread = 0.20 + si as f32 * 0.02;
                let mut ok = 0;
                let mut fallos = Vec::new();
                for (esperado, nov) in &novs {
                    let d = estimate_with(nov, fps, pref, spread);
                    if (d - esperado).abs() < 4.0 { ok += 1 } else { fallos.push((*esperado, d)) }
                }
                if ok > mejor.0 {
                    mejor = (ok, pref, spread, fallos);
                }
            }
        }
        println!("
MEJOR: {}/{} aciertos con PREFERRED={} SPREAD={:.2}",
                 mejor.0, novs.len(), mejor.1, mejor.2);
        for (esperado, detectado) in &mejor.3 {
            println!("   falla: esperaba {esperado}, detectó {detectado:.1}");
        }
    }

    fn estimate_with(nov: &[f32], fps: f32, pref: f32, spread: f32) -> f32 {
        let mean = nov.iter().sum::<f32>() / nov.len() as f32;
        let c: Vec<f32> = nov.iter().map(|v| v - mean).collect();
        let min_lag = (60.0 * fps / MAX_BPM).round().max(1.0) as usize;
        let max_lag = ((60.0 * fps / MIN_BPM).round() as usize).min(c.len() / 2);
        let (mut best_lag, mut best) = (min_lag, f32::MIN);
        for lag in min_lag..=max_lag {
            let ov = c.len() - lag;
            let r = (0..ov).map(|i| c[i] * c[i + lag]).sum::<f32>() / c.len() as f32;
            let bpm = 60.0 * fps / lag as f32;
            let d = (bpm / pref).ln() / spread;
            let w = (-0.5 * d * d).exp();
            if r * w > best { best = r * w; best_lag = lag }
        }
        60.0 * fps / best_lag as f32
    }
}
