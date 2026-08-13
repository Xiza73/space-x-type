//! Las dos herramientas externas que el pipeline de audio necesita.
//!
//! La app las trata distinto **porque son distintas**:
//!
//! - **QuickJS** viene empaquetado. Es un motor de JavaScript: no habla con
//!   YouTube, así que no caduca, y pesa 1–2 MB. Sin él, YouTube rechaza la
//!   descarga con un 403 que no menciona ni una vez que falta un runtime.
//! - **yt-dlp se descarga** la primera vez que hace falta. Empaquetarlo costaba
//!   entre 17 y 38 MB según la plataforma —contra los 3 MB que pesa hoy el
//!   instalador— y, peor, **caduca en semanas**: YouTube rota las firmas y
//!   vuelve el mismo 403, pero esta vez sin arreglo hasta sacar otra versión de
//!   la app. Bajándolo, siempre es el último y se puede actualizar solo.
//!
//! Lo descargado se verifica contra el hash que publica el propio proyecto. Es
//! un ejecutable que va a correr en la máquina del usuario: bajarlo sin
//! comprobar qué llegó no es una opción.

use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use super::store::LibraryError;

/// Última versión publicada de yt-dlp.
const YTDLP_LATEST: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
/// Cuánto se espera por la red antes de rendirse.
const TIMEOUT_SECS: u64 = 120;
/// Techo del cuerpo a leer. yt-dlp pesa menos de 40 MB; el resto es defensa.
const MAX_DOWNLOAD_BYTES: u64 = 96 * 1024 * 1024;

/// Nombre del binario de yt-dlp para esta plataforma, tal como lo publican.
const fn ytdlp_asset() -> &'static str {
    if cfg!(windows) {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else {
        "yt-dlp_linux"
    }
}

fn ytdlp_file_name() -> &'static str {
    if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" }
}

/// Dónde vive yt-dlp una vez instalado: en el directorio de datos de la app.
///
/// **No al lado del ejecutable**, que en Windows queda bajo `Program Files` y
/// necesita permisos de administrador para escribir. Aquí se puede actualizar
/// sin pedirle nada al usuario.
pub fn ytdlp_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("bin")
}

/// El yt-dlp que se va a usar, si ya hay alguno.
///
/// Primero el que instaló la app, después el del `PATH`. Ese orden importa: si
/// el usuario ya tenía uno instalado a mano, el nuestro —más nuevo y que
/// podemos actualizar— manda.
pub fn find_ytdlp(data_dir: &Path) -> Option<PathBuf> {
    let propio = ytdlp_dir(data_dir).join(ytdlp_file_name());
    if propio.is_file() {
        return Some(propio);
    }
    en_el_path(ytdlp_file_name())
}

/// El QuickJS empaquetado, que Tauri deja al lado del ejecutable.
///
/// Devuelve `None` en desarrollo, donde no hay bundle: ahí yt-dlp usa lo que
/// haya en el `PATH`, que es lo que tiene una máquina de desarrollo.
pub fn find_quickjs() -> Option<PathBuf> {
    let nombre = if cfg!(windows) { "qjs.exe" } else { "qjs" };
    let junto_al_exe = std::env::current_exe().ok()?.parent()?.join(nombre);
    junto_al_exe.is_file().then_some(junto_al_exe)
}

/// Busca un ejecutable en el `PATH`.
fn en_el_path(nombre: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|path| {
        std::env::split_paths(&path)
            .map(|dir| dir.join(nombre))
            .find(|candidato| candidato.is_file())
    })
}

/// Deja yt-dlp disponible, descargándolo si no está.
///
/// Es una operación de red que puede tardar: la llama el comando de procesar,
/// en el hilo bloqueante, no el arranque de la app. Que abrir el juego dependa
/// de que haya internet sería absurdo — arcade y la canción simulada no
/// necesitan nada de esto.
pub fn ensure_ytdlp(data_dir: &Path) -> Result<PathBuf, LibraryError> {
    if let Some(existente) = find_ytdlp(data_dir) {
        return Ok(existente);
    }

    log::info!("yt-dlp no está: se descarga desde github.com/yt-dlp/yt-dlp");
    let release = fetch_release()?;
    let asset = ytdlp_asset();

    let url = asset_url(&release, asset).ok_or(LibraryError::ToolDownload)?;
    let sums_url = asset_url(&release, "SHA2-256SUMS").ok_or(LibraryError::ToolDownload)?;

    let esperado = expected_hash(&get_text(&sums_url)?, asset).ok_or(LibraryError::ToolDownload)?;
    let bytes = get_bytes(&url)?;

    let obtenido = hex(&Sha256::digest(&bytes));
    if obtenido != esperado {
        log::error!("el hash de yt-dlp no coincide: esperaba {esperado}, llegó {obtenido}");
        return Err(LibraryError::ToolChecksum);
    }

    let dir = ytdlp_dir(data_dir);
    std::fs::create_dir_all(&dir)?;
    let destino = dir.join(ytdlp_file_name());
    std::fs::write(&destino, &bytes)?;
    make_executable(&destino)?;

    log::info!("yt-dlp instalado en {}", destino.display());
    Ok(destino)
}

/// En Unix, un archivo escrito no nace ejecutable.
#[cfg(unix)]
fn make_executable(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permisos = std::fs::metadata(path)?.permissions();
    permisos.set_mode(0o755);
    std::fs::set_permissions(path, permisos)
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

fn fetch_release() -> Result<serde_json::Value, LibraryError> {
    let cuerpo = get_text(YTDLP_LATEST)?;
    serde_json::from_str(&cuerpo).map_err(|e| {
        log::error!("el release de yt-dlp no se pudo leer: {e}");
        LibraryError::ToolDownload
    })
}

/// La URL de descarga de un asset, buscándolo por nombre exacto.
///
/// Por nombre exacto y no por prefijo: `yt-dlp.exe` y `yt-dlp_win.zip` empiezan
/// igual, y bajar el que no es termina en un ejecutable que no corre.
pub fn asset_url(release: &serde_json::Value, nombre: &str) -> Option<String> {
    release
        .get("assets")?
        .as_array()?
        .iter()
        .find(|a| a.get("name").and_then(|n| n.as_str()) == Some(nombre))?
        .get("browser_download_url")?
        .as_str()
        .map(str::to_string)
}

/// Saca el hash de un asset del archivo de sumas que publica el proyecto.
///
/// El formato es `<hash>  <archivo>` por línea. Se compara el nombre completo:
/// buscar por subcadena haría que `yt-dlp` matchee la línea de `yt-dlp.exe`.
pub fn expected_hash(sums: &str, asset: &str) -> Option<String> {
    sums.lines().find_map(|linea| {
        let (hash, nombre) = linea.split_once("  ")?;
        (nombre.trim() == asset).then(|| hash.trim().to_lowercase())
    })
}

fn get_text(url: &str) -> Result<String, LibraryError> {
    Ok(String::from_utf8_lossy(&get_bytes(url)?).into_owned())
}

fn get_bytes(url: &str) -> Result<Vec<u8>, LibraryError> {
    let agente = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(TIMEOUT_SECS)))
        .build()
        .new_agent();

    let mut respuesta = agente
        .get(url)
        // GitHub rechaza pedidos sin identificación.
        .header("User-Agent", "space-x-type")
        .call()
        .map_err(|e| {
            log::error!("falló la descarga de {url}: {e}");
            LibraryError::ToolDownload
        })?;

    let mut bytes = Vec::new();
    respuesta
        .body_mut()
        .as_reader()
        .take(MAX_DOWNLOAD_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|e| {
            log::error!("falló la lectura de {url}: {e}");
            LibraryError::ToolDownload
        })?;

    Ok(bytes)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saca_el_hash_del_archivo_de_sumas() {
        let sums = "\
aaa111  yt-dlp
bbb222  yt-dlp.exe
ccc333  yt-dlp_macos";

        assert_eq!(expected_hash(sums, "yt-dlp.exe").as_deref(), Some("bbb222"));
        assert_eq!(expected_hash(sums, "yt-dlp_macos").as_deref(), Some("ccc333"));
    }

    #[test]
    fn el_nombre_se_compara_completo_no_por_prefijo() {
        // `yt-dlp` es prefijo de `yt-dlp.exe`. Con una comparación por prefijo,
        // pedir uno devolvería el hash del otro y la verificación fallaría
        // siempre — o peor, pasaría con el binario equivocado.
        let sums = "aaa111  yt-dlp.exe\nbbb222  yt-dlp";

        assert_eq!(expected_hash(sums, "yt-dlp").as_deref(), Some("bbb222"));
    }

    #[test]
    fn sin_el_asset_no_inventa_un_hash() {
        assert_eq!(expected_hash("aaa111  otra-cosa", "yt-dlp.exe"), None);
    }

    #[test]
    fn el_asset_se_busca_por_nombre_exacto() {
        let release = serde_json::json!({
            "assets": [
                { "name": "yt-dlp_win.zip", "browser_download_url": "https://x/zip" },
                { "name": "yt-dlp.exe", "browser_download_url": "https://x/exe" },
            ]
        });

        // Ambos empiezan con `yt-dlp`, y bajar el que no es termina en un
        // ejecutable que no corre.
        assert_eq!(asset_url(&release, "yt-dlp.exe").as_deref(), Some("https://x/exe"));
    }

    #[test]
    fn un_release_sin_ese_asset_no_da_url() {
        let release = serde_json::json!({ "assets": [] });
        assert_eq!(asset_url(&release, "yt-dlp.exe"), None);
    }

    #[test]
    fn el_binario_se_instala_en_el_directorio_de_datos() {
        // Y no al lado del ejecutable, que en Windows queda bajo Program Files
        // y necesitaría permisos de administrador para actualizarse.
        let dir = Path::new("/datos");
        assert_eq!(ytdlp_dir(dir), dir.join("bin"));
    }

    #[test]
    fn el_nombre_del_asset_es_el_de_esta_plataforma() {
        let asset = ytdlp_asset();
        if cfg!(windows) {
            assert_eq!(asset, "yt-dlp.exe");
        } else if cfg!(target_os = "macos") {
            assert_eq!(asset, "yt-dlp_macos");
        } else {
            assert_eq!(asset, "yt-dlp_linux");
        }
    }
}
