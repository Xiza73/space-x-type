//! Validación de la URL de origen y extracción del id de video.
//!
//! Este módulo es **el límite de confianza** del proyecto: lo que salga de acá
//! se le pasa a un proceso externo y se usa para armar rutas en el disco. Todo
//! es puro y está testeado con entradas hostiles a propósito.

use url::Url;

/// Tope de longitud. Una URL de YouTube legítima no llega ni cerca.
pub const MAX_URL_LEN: usize = 512;

/// Los ids de YouTube son exactamente 11 caracteres de este alfabeto.
const ID_LEN: usize = 11;

const ALLOWED_HOSTS: [&str; 5] = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
];

/// Segmentos que preceden al id en las formas de URL con ruta.
const ID_PATH_PREFIXES: [&str; 4] = ["shorts", "embed", "live", "v"];

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum SourceError {
    #[error("la URL es demasiado larga")]
    TooLong,
    #[error("no es una URL válida")]
    Malformed,
    #[error("solo se aceptan URLs https")]
    NotHttps,
    #[error("solo se aceptan enlaces de YouTube")]
    HostNotAllowed,
    #[error("la URL no apunta a un video")]
    NoVideoId,
}

/// Extrae el id de video de una URL de YouTube, validándola en el camino.
///
/// El id que devuelve está garantizado a ser 11 caracteres de `[A-Za-z0-9_-]`.
/// Esa garantía es la que hace seguro usarlo como nombre de carpeta: no puede
/// contener `..`, ni separadores de ruta, ni bytes nulos, ni nombres reservados
/// de Windows.
pub fn video_id(raw: &str) -> Result<String, SourceError> {
    if raw.len() > MAX_URL_LEN {
        return Err(SourceError::TooLong);
    }

    let url = Url::parse(raw.trim()).map_err(|_| SourceError::Malformed)?;

    // Solo https. `file:`, `data:` y `javascript:` quedan afuera por acá.
    if url.scheme() != "https" {
        return Err(SourceError::NotHttps);
    }

    let host = url.host_str().ok_or(SourceError::Malformed)?.to_lowercase();
    if !ALLOWED_HOSTS.contains(&host.as_str()) {
        return Err(SourceError::HostNotAllowed);
    }

    let candidate = extract_candidate(&url, &host).ok_or(SourceError::NoVideoId)?;
    if is_valid_id(&candidate) {
        Ok(candidate)
    } else {
        Err(SourceError::NoVideoId)
    }
}

fn extract_candidate(url: &Url, host: &str) -> Option<String> {
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|p| !p.is_empty()).collect())
        .unwrap_or_default();

    // youtu.be/<id>
    if host == "youtu.be" {
        return segments.first().map(|s| (*s).to_string());
    }

    // /watch?v=<id>
    if let Some((_, value)) = url.query_pairs().find(|(key, _)| key == "v") {
        return Some(value.into_owned());
    }

    // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
    match (segments.first(), segments.get(1)) {
        (Some(prefix), Some(id)) if ID_PATH_PREFIXES.contains(prefix) => Some((*id).to_string()),
        _ => None,
    }
}

fn is_valid_id(candidate: &str) -> bool {
    candidate.len() == ID_LEN
        && candidate
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "dQw4w9WgXcQ";

    #[test]
    fn acepta_las_formas_habituales() {
        let casos = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=dQw4w9WgXcQ",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ",
        ];
        for caso in casos {
            assert_eq!(video_id(caso).as_deref(), Ok(ID), "falló con {caso}");
        }
    }

    #[test]
    fn ignora_los_parametros_de_mas() {
        // El `list=` es importante: sin `--no-playlist`, yt-dlp se bajaría la
        // playlist entera. El id que sacamos sigue siendo el del video.
        assert_eq!(
            video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4&t=42s")
                .as_deref(),
            Ok(ID)
        );
        assert_eq!(video_id("https://youtu.be/dQw4w9WgXcQ?t=30").as_deref(), Ok(ID));
    }

    #[test]
    fn tolera_espacios_alrededor() {
        assert_eq!(
            video_id("  https://youtu.be/dQw4w9WgXcQ  ").as_deref(),
            Ok(ID)
        );
    }

    #[test]
    fn rechaza_esquemas_que_no_sean_https() {
        for caso in [
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
        ] {
            assert!(matches!(
                video_id(caso),
                Err(SourceError::NotHttps) | Err(SourceError::Malformed)
            ), "no rechazó {caso}");
        }
    }

    #[test]
    fn rechaza_hosts_que_no_son_youtube() {
        for caso in [
            "https://evil.com/watch?v=dQw4w9WgXcQ",
            // El clásico: el host real es el de la derecha, no el de la izquierda.
            "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
            "https://evil.com/?x=youtube.com/watch?v=dQw4w9WgXcQ",
            "https://user:pass@evil.com/watch?v=dQw4w9WgXcQ",
        ] {
            assert_eq!(video_id(caso), Err(SourceError::HostNotAllowed), "no rechazó {caso}");
        }
    }

    #[test]
    fn el_host_no_distingue_mayusculas() {
        assert_eq!(
            video_id("https://WWW.YouTube.COM/watch?v=dQw4w9WgXcQ").as_deref(),
            Ok(ID)
        );
    }

    #[test]
    fn rechaza_ids_que_no_tienen_la_forma_esperada() {
        for caso in [
            // Path traversal disfrazado de id.
            "https://youtu.be/../../../etc",
            "https://www.youtube.com/watch?v=../../secret",
            // Nombres reservados de Windows.
            "https://www.youtube.com/watch?v=NUL",
            "https://www.youtube.com/watch?v=CON",
            // Largos incorrectos.
            "https://www.youtube.com/watch?v=corto",
            "https://www.youtube.com/watch?v=demasiadolargoparaunid",
            // Caracteres fuera del alfabeto.
            "https://www.youtube.com/watch?v=dQw4w9WgXc%20",
            "https://www.youtube.com/watch?v=dQw4w9WgXc/",
            "https://www.youtube.com/watch?v=dQw4w9WgXc.",
        ] {
            assert!(
                matches!(video_id(caso), Err(SourceError::NoVideoId)),
                "no rechazó {caso}: {:?}",
                video_id(caso)
            );
        }
    }

    #[test]
    fn rechaza_urls_larguisimas() {
        let larga = format!("https://youtu.be/{}", "a".repeat(MAX_URL_LEN));
        assert_eq!(video_id(&larga), Err(SourceError::TooLong));
    }

    #[test]
    fn rechaza_basura_que_no_es_una_url() {
        for caso in ["", "no soy una url", "youtube.com/watch?v=dQw4w9WgXcQ"] {
            assert_eq!(video_id(caso), Err(SourceError::Malformed), "no rechazó {caso}");
        }
    }

    #[test]
    fn el_id_que_sale_siempre_es_seguro_como_nombre_de_carpeta() {
        // La garantía en la que se apoya todo el manejo de rutas de la biblioteca.
        let id = video_id("https://youtu.be/dQw4w9WgXcQ").unwrap();
        assert!(!id.contains('/') && !id.contains('\\') && !id.contains(".."));
        assert!(!id.contains('\0'));
        assert_eq!(id.len(), ID_LEN);
    }
}
