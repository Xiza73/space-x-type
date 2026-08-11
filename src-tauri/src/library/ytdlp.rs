//! Descarga del audio con `yt-dlp`.
//!
//! Acá está el límite de confianza más caliente del proyecto: se le pasa a un
//! proceso externo una URL que escribió el usuario.

use std::fs;
use std::path::Path;
use std::process::Command;

use serde::Deserialize;

use super::store::LibraryError;

/// Formato preferido: m4a (AAC). Se elige a propósito y no `bestaudio` a secas
/// porque es lo que después se puede decodificar sin depender de ffmpeg.
const FORMAT: &str = "bestaudio[ext=m4a]/bestaudio";

/// Lo único que se usa del JSON que escupe yt-dlp. El resto del dict es enorme
/// y su forma cambia entre versiones.
#[derive(Debug, Deserialize)]
struct Info {
    #[serde(default)]
    title: String,
    #[serde(default)]
    duration: Option<f64>,
}

pub struct Downloaded {
    pub title: String,
    pub duration_sec: u32,
    /// Solo el nombre del archivo. La ruta se recalcula desde el id validado.
    pub file_name: String,
}

/// Baja el audio de `url` dentro de `dir`.
///
/// Reglas que **no** se negocian:
/// - Argumentos como vector, nunca una línea de comando armada con `format!`.
///   Con vector, el sistema no interpreta metacaracteres: no hay inyección.
/// - Nada de shell (`cmd /c`, `sh -c`, `powershell`).
/// - La URL va **después de `--`**, para que algo que empiece con `-` no se
///   pueda hacer pasar por un flag de yt-dlp.
/// - Los flags son fijos y están acá. El usuario no aporta ninguno.
/// - `--no-playlist` es crítico: sin eso, una URL con `&list=` se baja la
///   playlist entera, que es una descarga que el usuario nunca pidió.
pub fn download(url: &str, dir: &Path, stem: &str) -> Result<Downloaded, LibraryError> {
    fs::create_dir_all(dir)?;

    let template = dir.join(format!("{stem}.%(ext)s"));

    let mut command = Command::new("yt-dlp");
    command
        .arg("--no-playlist")
        .arg("--no-progress")
        .arg("--no-warnings")
        .arg("--no-continue")
        // `-j` imprime el JSON del video, pero **simula por defecto**: sin
        // `--no-simulate` no descarga nada y el proceso termina con éxito. Un
        // no-op silencioso, que es la peor clase de bug.
        .arg("-j")
        .arg("--no-simulate")
        .arg("-f")
        .arg(FORMAT)
        .arg("-o")
        .arg(&template)
        .arg("--")
        .arg(url);

    no_console_window(&mut command);

    let output = match command.output() {
        Ok(output) => output,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(LibraryError::YtDlpMissing)
        }
        Err(e) => return Err(e.into()),
    };

    if !output.status.success() {
        // El stderr del proceso hijo va al log, NO al usuario: puede filtrar
        // rutas del sistema y no le dice nada útil a nadie.
        log::error!(
            "yt-dlp salió con {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        );
        return Err(LibraryError::Download);
    }

    let info = parse_info(&String::from_utf8_lossy(&output.stdout));
    let file_name = find_audio_file(dir, stem)?;

    Ok(Downloaded {
        title: clean_title(&info.title),
        duration_sec: info.duration.unwrap_or(0.0).max(0.0) as u32,
        file_name,
    })
}

/// En Windows, un proceso de consola lanzado desde una app gráfica abre una
/// ventana negra. Esto la evita.
#[cfg(windows)]
fn no_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn no_console_window(_command: &mut Command) {}

/// `--print-json` puede imprimir más de una línea; se usa la primera que parsee.
fn parse_info(stdout: &str) -> Info {
    stdout
        .lines()
        .find_map(|line| serde_json::from_str::<Info>(line).ok())
        .unwrap_or(Info { title: String::new(), duration: None })
}

/// El título viene de internet: es **dato**, no markup ni instrucciones. Se le
/// sacan los caracteres de control y se acota el largo antes de guardarlo.
fn clean_title(raw: &str) -> String {
    let cleaned: String = raw.chars().filter(|c| !c.is_control()).take(160).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "Sin título".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Se busca el archivo en el disco en vez de creerle al JSON: el campo del
/// nombre de archivo cambió de forma entre versiones de yt-dlp, el disco no.
fn find_audio_file(dir: &Path, stem: &str) -> Result<String, LibraryError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(&format!("{stem}.")) && entry.path().is_file() {
            return Ok(name);
        }
    }
    Err(LibraryError::Download)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saca_titulo_y_duracion_del_json() {
        let info = parse_info(r#"{"title":"Una canción","duration":213.5,"otro":"campo"}"#);
        assert_eq!(info.title, "Una canción");
        assert_eq!(info.duration, Some(213.5));
    }

    #[test]
    fn aguanta_lineas_de_ruido_antes_del_json() {
        let info = parse_info("[youtube] descargando\n{\"title\":\"Tema\",\"duration\":10}\n");
        assert_eq!(info.title, "Tema");
    }

    #[test]
    fn no_revienta_si_no_hay_json() {
        let info = parse_info("nada util por acá");
        assert_eq!(info.title, "");
        assert_eq!(info.duration, None);
    }

    #[test]
    fn aguanta_un_video_sin_duracion() {
        // Los vivos vienen con `duration: null`.
        let info = parse_info(r#"{"title":"En vivo","duration":null}"#);
        assert_eq!(info.duration, None);
    }

    #[test]
    fn el_titulo_es_dato_que_viene_de_internet() {
        // Se le sacan los caracteres de control y se acota el largo.
        assert_eq!(clean_title("Te\u{0}ma\u{7}"), "Tema");
        assert_eq!(clean_title("salto\nde linea"), "saltode linea");
        assert_eq!(clean_title("  espacios  "), "espacios");
        assert_eq!(clean_title(""), "Sin título");
        assert_eq!(clean_title("   "), "Sin título");
        assert_eq!(clean_title(&"a".repeat(500)).chars().count(), 160);
    }

    #[test]
    fn encuentra_el_audio_por_su_prefijo() {
        let dir = std::env::temp_dir().join("sxt-ytdlp-encuentra");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("audio.m4a"), b"x").unwrap();

        assert_eq!(find_audio_file(&dir, "audio").unwrap(), "audio.m4a");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn falla_si_no_quedo_ningun_archivo() {
        let dir = std::env::temp_dir().join("sxt-ytdlp-vacio");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        assert!(matches!(find_audio_file(&dir, "audio"), Err(LibraryError::Download)));

        let _ = fs::remove_dir_all(&dir);
    }
}
