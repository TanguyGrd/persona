use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Call {
    id: String,
    name: String,
    args: Value,
}
#[derive(Serialize)]
pub struct Observation {
    ok: bool,
    summary: String,
    data: Value,
}

pub fn public_page(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Adresse invalide.")?;
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    let tld = host.rsplit('.').next().unwrap_or("");
    if value.len() > 2048
        || url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || !host.contains('.')
        || tld.len() < 2
        || !tld.bytes().all(|c| c.is_ascii_alphabetic())
        || host.parse::<std::net::IpAddr>().is_ok()
        || host.starts_with('[')
        || ["localhost", "local", "internal", "test", "invalid"]
            .iter()
            .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
    {
        return Err("Seules les pages HTTPS publiques sont autorisées.".into());
    }
    Ok(url)
}
fn open_browser(app: &AppHandle, url: reqwest::Url) -> Result<Observation, String> {
    if let Some(window) = app.get_webview_window("agent-browser") {
        window.navigate(url).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        WebviewWindowBuilder::new(app, "agent-browser", WebviewUrl::External(url))
            .title("Navigateur Persona")
            .inner_size(1100.0, 760.0)
            .data_directory(
                app.path()
                    .app_config_dir()
                    .map_err(|e| e.to_string())?
                    .join("agent-browser"),
            )
            .on_navigation(|url| public_page(url.as_str()).is_ok())
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .build()
            .map_err(|e| e.to_string())?;
    }
    Ok(Observation {
        ok: true,
        summary:
            "Fenêtre du navigateur Persona ouverte ; chargement et contenu de la page non vérifiés."
                .into(),
        data: json!({"status":"browserWindowOpened"}),
    })
}
#[cfg(windows)]
fn open_application(application: &str) -> Result<Observation, String> {
    use windows_sys::Win32::{
        System::SystemInformation::GetSystemDirectoryW,
        UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };
    let file = match application {
        "discord" => "discord://-/channels/@me".to_string(),
        "calculator" | "notepad" => {
            let mut directory = vec![0_u16; 32768];
            let len = unsafe { GetSystemDirectoryW(directory.as_mut_ptr(), directory.len() as u32) }
                as usize;
            if len == 0 || len >= directory.len() {
                return Err("Dossier système Windows indisponible.".into());
            }
            let exe = if application == "calculator" {
                "calc.exe"
            } else {
                "notepad.exe"
            };
            format!("{}\\{exe}", String::from_utf16_lossy(&directory[..len]))
        }
        _ => return Err("Application non autorisée.".into()),
    };
    let file: Vec<u16> = file.encode_utf16().chain(Some(0)).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;
    if result <= 32 {
        return Err(
            "Windows n’a pas pu ouvrir cette application. Vérifiez qu’elle est installée.".into(),
        );
    }
    Ok(Observation { ok: true, summary: "Windows a accepté la demande d’ouverture. La présence de l’application à l’écran n’a pas été vérifiée ; aucun appel ni message n’a été lancé.".into(), data: json!({"status":"launchAccepted","application":application}) })
}
#[cfg(not(windows))]
fn open_application(_application: &str) -> Result<Observation, String> {
    Err("Cette commande nécessite Windows.".into())
}

#[tauri::command]
pub async fn agent_tool(
    call: Call,
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Observation, String> {
    if window.label() != "main" || call.id.is_empty() || call.id.len() > 100 {
        return Err("Appel d’outil refusé.".into());
    }
    let args = call
        .args
        .as_object()
        .ok_or("Arguments d’outil invalides.")?;
    match call.name.as_str() {
        "media_pause" | "media_play" if args.is_empty() => {
            let play = call.name == "media_play";
            let result = tauri::async_runtime::spawn_blocking(move || {
                if play {
                    crate::media::play()
                } else {
                    crate::media::pause()
                }
            })
            .await
            .map_err(|e| e.to_string())??;
            let data = serde_json::to_value(result).map_err(|e| e.to_string())?;
            let status = data.get("status").and_then(Value::as_str).unwrap_or("");
            let (ok, summary) = match status {
                "paused" => (
                    true,
                    "Windows confirme que le média sélectionné est en pause.",
                ),
                "alreadyPaused" => (true, "Le média sélectionné est déjà en pause."),
                "played" => (
                    true,
                    "Windows confirme que le média sélectionné est en lecture.",
                ),
                "alreadyPlaying" => (true, "Le média sélectionné est déjà en lecture."),
                "noSession" => (false, "Windows ne signale aucun média contrôlable."),
                "notPlaying" => (false, "L’état du lecteur ne permet pas cette opération."),
                "refused" => (false, "Le lecteur a refusé la commande."),
                _ => (
                    false,
                    "La commande a été acceptée, mais son résultat n’est pas confirmé.",
                ),
            };
            Ok(Observation {
                ok,
                summary: summary.into(),
                data,
            })
        }
        "open_application" if args.len() == 1 => {
            let application = args
                .get("application")
                .and_then(Value::as_str)
                .ok_or("Application invalide.")?
                .to_string();
            tauri::async_runtime::spawn_blocking(move || open_application(&application))
                .await
                .map_err(|e| e.to_string())?
        }
        "open_page" if args.len() == 1 => open_browser(
            &app,
            public_page(
                args.get("url")
                    .and_then(Value::as_str)
                    .ok_or("Adresse invalide.")?,
            )?,
        ),
        "search_web" if args.len() == 1 => {
            let query = args
                .get("query")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty() && s.chars().count() <= 300)
                .ok_or("Recherche invalide.")?;
            let mut url = reqwest::Url::parse("https://www.google.com/search").unwrap();
            url.query_pairs_mut().append_pair("q", query);
            open_browser(&app, url)
        }
        _ => Err("Outil indisponible ou arguments invalides.".into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_is_restricted_to_public_https_pages() {
        assert!(public_page("https://discord.com/channels/@me").is_ok());
        for value in [
            "http://example.org",
            "https://127.0.0.1/",
            "https://[::1]/",
            "https://tauri.localhost/",
            "https://intranet.local/",
            "https://a:b@example.org",
            "file:///C:/Windows",
            "javascript:alert(1)",
            "https://example.org:444",
        ] {
            assert!(public_page(value).is_err(), "{value}");
        }
    }
}
