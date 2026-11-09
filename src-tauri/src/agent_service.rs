use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tokio::sync::Notify;

struct Job {
    cancelled: AtomicBool,
    notify: Notify,
    created: Instant,
}
impl Job {
    fn new() -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            notify: Notify::new(),
            created: Instant::now(),
        }
    }
}
pub struct AgentRelay {
    client: reqwest::Client,
    jobs: Mutex<HashMap<String, Arc<Job>>>,
}
impl AgentRelay {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(30))
                .build()?,
            jobs: Mutex::new(HashMap::new()),
        })
    }
    fn job(&self, id: &str) -> Result<Arc<Job>, String> {
        if id.len() < 8
            || id.len() > 80
            || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        {
            return Err("Identifiant de requête invalide.".into());
        }
        let mut jobs = self.jobs.lock().map_err(|e| e.to_string())?;
        jobs.retain(|_, job| job.created.elapsed() < Duration::from_secs(90));
        if jobs.len() >= 32 && !jobs.contains_key(id) {
            return Err("Trop de requêtes en attente.".into());
        }
        Ok(jobs
            .entry(id.to_string())
            .or_insert_with(|| Arc::new(Job::new()))
            .clone())
    }
}
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Commande réservée au compagnon.".into());
    }
    Ok(())
}

pub fn trusted_companion(label: &str, url: &reqwest::Url, development: bool) -> bool {
    if label != "main" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let bundled = ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost")))
        && url.port().is_none();
    let dev = development
        && url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(1420);
    bundled || dev
}
pub fn validate_service_url(value: &str) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(value).map_err(|_| "Adresse du service invalide.")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if value.len() > 2048
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || (url.scheme() != "https" && !(url.scheme() == "http" && local))
    {
        return Err("Le service doit utiliser HTTPS (HTTP seulement en boucle locale).".into());
    }
    let path = format!("{}/", url.path().trim_end_matches('/'));
    url.set_path(&path);
    Ok(url)
}
fn service_url(app: &AppHandle) -> Result<Option<reqwest::Url>, String> {
    // This is an operator endpoint, never a model-provided URL. No API key is read here.
    let setting = std::env::var("PERSONA_SERVICE_URL")
        .ok()
        .filter(|url| !url.trim().is_empty())
        .or_else(|| {
            option_env!("PERSONA_SERVICE_URL")
                .filter(|url| !url.trim().is_empty())
                .map(str::to_owned)
        });
    let setting = match setting {
        Some(value) => Some(value),
        None => {
            let path = app
                .path()
                .app_config_dir()
                .map_err(|e| e.to_string())?
                .join("agent-service.json");
            if path.exists() {
                let data: Value =
                    serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
                        .map_err(|_| "Configuration du service invalide.")?;
                data.get("url").and_then(Value::as_str).map(str::to_owned)
            } else {
                None
            }
        }
    };
    setting
        .map(|value| validate_service_url(&value))
        .transpose()
}

#[cfg(windows)]
fn credential(url: &reqwest::Url, write: Option<Option<&str>>) -> Result<Option<String>, String> {
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_NOT_FOUND},
        Security::Credentials::{
            CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
            CRED_TYPE_GENERIC,
        },
    };
    let mut target: Vec<u16> = format!("Persona/Agent/{}", url.as_str())
        .encode_utf16()
        .chain(Some(0))
        .collect();
    unsafe {
        if let Some(value) = write {
            if let Some(token) = value {
                let mut bytes = token.as_bytes().to_vec();
                let mut username: Vec<u16> = "Persona".encode_utf16().chain(Some(0)).collect();
                let mut entry: CREDENTIALW = std::mem::zeroed();
                entry.Type = CRED_TYPE_GENERIC;
                entry.TargetName = target.as_mut_ptr();
                entry.Persist = CRED_PERSIST_LOCAL_MACHINE;
                entry.CredentialBlobSize = bytes.len() as u32;
                entry.CredentialBlob = bytes.as_mut_ptr();
                entry.UserName = username.as_mut_ptr();
                if CredWriteW(&entry, 0) == 0 {
                    return Err(
                        "Impossible d’enregistrer la connexion dans le coffre Windows.".into(),
                    );
                }
            } else if CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) == 0
                && GetLastError() != ERROR_NOT_FOUND
            {
                return Err("Impossible de retirer la connexion du coffre Windows.".into());
            }
            return Ok(None);
        }
        let mut entry = std::ptr::null_mut();
        if CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut entry) == 0 {
            if GetLastError() == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err("Impossible de lire la connexion dans le coffre Windows.".into());
        }
        let result = if (*entry).CredentialBlobSize > 128 || (*entry).CredentialBlob.is_null() {
            Err("Connexion Windows invalide.".into())
        } else {
            String::from_utf8(
                std::slice::from_raw_parts(
                    (*entry).CredentialBlob,
                    (*entry).CredentialBlobSize as usize,
                )
                .to_vec(),
            )
            .map(Some)
            .map_err(|_| "Connexion Windows invalide.".into())
        };
        CredFree(entry.cast());
        result
    }
}
#[cfg(not(windows))]
fn credential(_url: &reqwest::Url, _write: Option<Option<&str>>) -> Result<Option<String>, String> {
    Err("Le coffre de connexion est implémenté pour Windows.".into())
}

async fn read_response(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    if response.content_length().is_some_and(|len| len > 128_000) {
        return Err("Réponse du service trop grande.".into());
    }
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Lecture du service interrompue.")?
    {
        if bytes.len() + chunk.len() > 128_000 {
            return Err("Réponse du service trop grande.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body: Value = serde_json::from_slice(&bytes).map_err(|_| "Réponse du service invalide.")?;
    if !status.is_success() {
        let error = body
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Le service Persona a refusé la demande.");
        return Err(error.chars().take(400).collect());
    }
    Ok(body)
}

#[tauri::command]
pub async fn agent_status(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AgentRelay>,
) -> Result<Value, String> {
    main_only(&window)?;
    let Some(url) = service_url(&app)? else {
        return Ok(
            json!({"state":"notConfigured","detail":"Le service Persona n’est pas encore configuré pour cette version."}),
        );
    };
    let Some(token) = credential(&url, None)? else {
        return Ok(
            json!({"state":"notPaired","detail":"Connectez cet appareil avec le code fourni par Persona."}),
        );
    };
    let result = state
        .client
        .get(url.join("v1/status").map_err(|e| e.to_string())?)
        .bearer_auth(token)
        .send()
        .await;
    match result {
        Ok(response) if response.status() == reqwest::StatusCode::UNAUTHORIZED => Ok(
            json!({"state":"notPaired","detail":"Cette connexion a été révoquée. Reconnectez cet appareil."}),
        ),
        Ok(response) => {
            let mut value = read_response(response).await.unwrap_or_else(
                |_| json!({"state":"unavailable","detail":"Le service Persona est indisponible."}),
            );
            if !value.is_object() {
                value = json!({"state":"unavailable","detail":"Réponse du service invalide."});
            }
            value["paired"] = json!(true);
            Ok(value)
        }
        Err(_) => Ok(
            json!({"state":"unavailable","paired":true,"detail":"Le service Persona est injoignable."}),
        ),
    }
}
#[tauri::command]
pub async fn agent_pair(
    code: String,
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AgentRelay>,
) -> Result<(), String> {
    main_only(&window)?;
    if code.len() < 12 || code.len() > 80 {
        return Err("Code de connexion invalide.".into());
    }
    let url = service_url(&app)?.ok_or("Le service Persona reste à configurer.")?;
    let response = state
        .client
        .post(url.join("v1/pair").map_err(|e| e.to_string())?)
        .json(&json!({"code":code}))
        .send()
        .await
        .map_err(|_| "Connexion au service impossible.")?;
    let body = read_response(response).await?;
    let token = body
        .get("token")
        .and_then(Value::as_str)
        .filter(|s| s.starts_with("persona_") && s.len() < 128)
        .ok_or("Connexion du service invalide.")?;
    credential(&url, Some(Some(token)))?;
    Ok(())
}
#[tauri::command]
pub async fn agent_disconnect(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AgentRelay>,
) -> Result<(), String> {
    main_only(&window)?;
    if let Some(url) = service_url(&app)? {
        if let Some(token) = credential(&url, None)? {
            // Remove locally even if the remote service is unreachable.
            credential(&url, Some(None))?;
            let _ = state
                .client
                .post(url.join("v1/disconnect").map_err(|e| e.to_string())?)
                .bearer_auth(token)
                .send()
                .await;
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn agent_step(
    request_id: String,
    request: Value,
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AgentRelay>,
) -> Result<Value, String> {
    main_only(&window)?;
    if serde_json::to_vec(&request)
        .map_err(|e| e.to_string())?
        .len()
        > 64_000
    {
        return Err("Conversation trop grande.".into());
    }
    let job = state.job(&request_id)?;
    if job.cancelled.load(Ordering::Relaxed) {
        return Err("Tâche arrêtée.".into());
    }
    let url = service_url(&app)?.ok_or("Le service Persona reste à configurer.")?;
    let token = credential(&url, None)?.ok_or("Connectez cet appareil au service Persona.")?;
    let result = tokio::select! {
        _ = job.notify.notified() => Err("Tâche arrêtée.".into()),
        result = async {
            let response = state.client.post(url.join("v1/step").map_err(|e| e.to_string())?).bearer_auth(token).json(&request).send().await.map_err(|_| "Connexion au service interrompue.")?;
            read_response(response).await
        } => result,
    };
    state
        .jobs
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&request_id);
    result
}
#[tauri::command]
pub fn agent_cancel(
    request_id: String,
    window: WebviewWindow,
    state: State<'_, AgentRelay>,
) -> Result<(), String> {
    main_only(&window)?;
    let job = state.job(&request_id)?;
    job.cancelled.store(true, Ordering::Relaxed);
    job.notify.notify_one();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_browser_and_remote_main_navigation_never_gain_application_commands() {
        let bundle = reqwest::Url::parse("http://tauri.localhost/").unwrap();
        assert!(trusted_companion("main", &bundle, false));
        assert!(!trusted_companion("agent-browser", &bundle, true));
        for value in [
            "https://example.org",
            "https://tauri.localhost.evil.org",
            "file:///C:/Windows",
            "http://tauri.localhost:4318/",
        ] {
            assert!(
                !trusted_companion("main", &reqwest::Url::parse(value).unwrap(), true),
                "{value}"
            );
        }
        let dev = reqwest::Url::parse("http://127.0.0.1:1420/").unwrap();
        assert!(trusted_companion("main", &dev, true));
        assert!(!trusted_companion("main", &dev, false));
    }
    #[test]
    fn service_urls_require_tls_except_loopback_and_never_embed_credentials() {
        assert!(validate_service_url("https://persona.example/service").is_ok());
        assert!(validate_service_url("http://127.0.0.1:4318").is_ok());
        for url in [
            "http://example.org",
            "https://token@service.example",
            "https://service.example?key=x",
            "file:///tmp/config",
            "javascript:alert(1)",
        ] {
            assert!(validate_service_url(url).is_err(), "{url}");
        }
    }
    #[test]
    fn cancellation_before_registration_is_retained_and_jobs_are_bounded() {
        let relay = AgentRelay::new().unwrap();
        let job = relay.job("request-0001").unwrap();
        job.cancelled.store(true, Ordering::Relaxed);
        assert!(relay
            .job("request-0001")
            .unwrap()
            .cancelled
            .load(Ordering::Relaxed));
        for index in 2..=32 {
            relay.job(&format!("request-{index:04}")).unwrap();
        }
        assert!(relay.job("request-0033").is_err());
        assert!(relay.job("bad/id/path").is_err());
    }
}
