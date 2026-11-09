#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_service;
mod agent_tools;
mod geometry;
mod media;
mod motion;

use geometry::{clamp_position, moved_panel_restore, HitRegion, SavedPosition};
use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent,
};

#[derive(Default)]
struct Interaction {
    regions: Vec<HitRegion>,
    captured: bool,
    ready: bool,
}

#[derive(Clone)]
struct DesktopState {
    interaction: Arc<Mutex<Interaction>>,
    position: Arc<Mutex<Option<(SavedPosition, Instant)>>>,
    running: Arc<AtomicBool>,
    position_file: PathBuf,
    menu_position: Arc<Mutex<Option<SavedPosition>>>,
    panel_drag: Arc<Mutex<Option<(SavedPosition, SavedPosition)>>>,
    motion: Arc<Mutex<motion::State>>,
}

fn report(result: tauri::Result<()>) {
    if let Err(error) = result {
        eprintln!("Persona desktop: {error}");
    }
}

fn show_companion(app: &AppHandle, settings: bool) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.emit("desktop-show", ())?;
        window.show()?;
        if settings {
            window.set_ignore_cursor_events(false)?;
            window.set_focus()?;
            window.emit("desktop-settings", ())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn set_launcher_open(
    open: bool,
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<(), String> {
    set_panel_open(open, false, &window, &state)
}

#[tauri::command]
fn set_chat_open(
    open: bool,
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<(), String> {
    set_panel_open(open, true, &window, &state)
}

fn set_panel_open(
    open: bool,
    compact: bool,
    window: &WebviewWindow,
    state: &DesktopState,
) -> Result<(), String> {
    finish_panel_drag(window, state)?;
    state
        .motion
        .lock()
        .map_err(|e| e.to_string())?
        .interrupt(false);
    let previous = *state.menu_position.lock().map_err(|e| e.to_string())?;
    if open {
        let origin = if let Some(position) = previous {
            position
        } else {
            save_position(state, true);
            let origin = window.outer_position().map_err(|e| e.to_string())?;
            let position = SavedPosition {
                x: origin.x,
                y: origin.y,
            };
            *state.menu_position.lock().map_err(|e| e.to_string())? = Some(position);
            position
        };
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let monitor = window.current_monitor().map_err(|e| e.to_string())?;
        let desired = if compact {
            (480.0_f64, 720.0_f64)
        } else {
            (980.0, 760.0)
        };
        let (width, height) = monitor
            .as_ref()
            .map(|m| {
                let area = m.work_area();
                (
                    desired.0.min(f64::from(area.size.width) / scale),
                    desired.1.min(f64::from(area.size.height) / scale),
                )
            })
            .unwrap_or(desired);
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        if compact {
            let mut position = SavedPosition {
                x: origin.x - ((width - 360.0) * scale / 2.0).round() as i32,
                y: origin.y - ((height - 320.0) * scale).round() as i32,
            };
            if let Some(monitor) = monitor {
                let area = monitor.work_area();
                position = clamp_position(
                    position,
                    (
                        area.position.x,
                        area.position.y,
                        area.size.width,
                        area.size.height,
                    ),
                    (
                        (width * scale).round() as u32,
                        (height * scale).round() as u32,
                    ),
                );
            }
            window
                .set_position(PhysicalPosition::new(position.x, position.y))
                .map_err(|e| e.to_string())?;
        } else {
            window.center().map_err(|e| e.to_string())?;
        }
        window
            .set_ignore_cursor_events(false)
            .map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else if !open {
        if let Some(position) = previous {
            window
                .set_size(LogicalSize::new(360.0, 320.0))
                .map_err(|e| e.to_string())?;
            window
                .set_position(PhysicalPosition::new(position.x, position.y))
                .map_err(|e| e.to_string())?;
            *state.menu_position.lock().map_err(|e| e.to_string())? = None;
        }
    }
    Ok(())
}

fn finish_panel_drag(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    let drag = state.panel_drag.lock().map_err(|e| e.to_string())?.take();
    if let Some((start, companion)) = drag {
        let end = window.outer_position().map_err(|e| e.to_string())?;
        let restored = moved_panel_restore(start, SavedPosition { x: end.x, y: end.y }, companion);
        let mut saved = state.menu_position.lock().map_err(|e| e.to_string())?;
        if saved.is_some() {
            *saved = Some(restored);
            drop(saved);
            *state.position.lock().map_err(|e| e.to_string())? = Some((restored, Instant::now()));
        }
    }
    Ok(())
}

#[tauri::command]
async fn pause_media(window: WebviewWindow) -> Result<media::PauseResult, String> {
    if window.label() != "main" {
        return Err("Commande réservée au compagnon.".into());
    }
    tauri::async_runtime::spawn_blocking(media::pause)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn desktop_ready(window: WebviewWindow, state: State<'_, DesktopState>) -> Result<(), String> {
    state.interaction.lock().map_err(|e| e.to_string())?.ready = true;
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_hit_regions(regions: Vec<HitRegion>, state: State<'_, DesktopState>) -> Result<(), String> {
    if regions.len() > 32 || regions.iter().any(|region| !region.valid()) {
        return Err("Invalid companion hit regions".into());
    }
    state.interaction.lock().map_err(|e| e.to_string())?.regions = regions;
    Ok(())
}

#[tauri::command]
fn set_pointer_capture(
    captured: bool,
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<(), String> {
    state
        .interaction
        .lock()
        .map_err(|e| e.to_string())?
        .captured = captured;
    if captured {
        state
            .motion
            .lock()
            .map_err(|e| e.to_string())?
            .interrupt(false);
        window
            .set_ignore_cursor_events(false)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn start_dragging(window: WebviewWindow, state: State<'_, DesktopState>) -> Result<(), String> {
    state
        .motion
        .lock()
        .map_err(|e| e.to_string())?
        .interrupt(true);
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        // IPC may arrive after a very quick gesture has already ended. Never
        // enter Windows' modal drag loop without the physical button held.
        if unsafe { GetAsyncKeyState(i32::from(VK_LBUTTON)) } >= 0 {
            state
                .interaction
                .lock()
                .map_err(|e| e.to_string())?
                .captured = false;
            return Ok(());
        }
    }
    state
        .interaction
        .lock()
        .map_err(|e| e.to_string())?
        .captured = true;
    let previous = *state.menu_position.lock().map_err(|e| e.to_string())?;
    if let Some(companion) = previous {
        let start = window.outer_position().map_err(|e| e.to_string())?;
        *state.panel_drag.lock().map_err(|e| e.to_string())? = Some((
            SavedPosition {
                x: start.x,
                y: start.y,
            },
            companion,
        ));
    }
    window
        .set_ignore_cursor_events(false)
        .map_err(|e| e.to_string())?;
    if let Err(error) = window.start_dragging() {
        *state.panel_drag.lock().map_err(|e| e.to_string())? = None;
        state
            .interaction
            .lock()
            .map_err(|e| e.to_string())?
            .captured = false;
        return Err(error.to_string());
    }
    // Windows clears capture from the physical mouse state, because native
    // dragging can consume the WebView's pointerup event.
    #[cfg(not(windows))]
    {
        state
            .interaction
            .lock()
            .map_err(|e| e.to_string())?
            .captured = false;
    }
    Ok(())
}

#[tauri::command]
fn hide_companion(window: WebviewWindow, state: State<'_, DesktopState>) -> Result<(), String> {
    state
        .motion
        .lock()
        .map_err(|e| e.to_string())?
        .interrupt(false);
    state
        .interaction
        .lock()
        .map_err(|e| e.to_string())?
        .captured = false;
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_settings(app: AppHandle) -> Result<(), String> {
    show_companion(&app, true).map_err(|e| e.to_string())
}

#[tauri::command]
fn configure_motion(config: motion::Config, state: State<'_, DesktopState>) -> Result<(), String> {
    if !config.valid() {
        return Err("Invalid desktop geometry".into());
    }
    state
        .motion
        .lock()
        .map_err(|e| e.to_string())?
        .configure(config);
    Ok(())
}

#[tauri::command]
fn desktop_world(window: WebviewWindow, state: State<'_, DesktopState>) -> Option<motion::World> {
    let captured = state.interaction.lock().ok()?.captured;
    let menu_open = state.menu_position.lock().ok()?.is_some();
    if captured || menu_open || !window.is_visible().unwrap_or(false) {
        return None;
    }
    let snapshot = state.motion.lock().ok()?.clone();
    motion::world(&window, &snapshot)
}

fn commit_motion(
    state: &DesktopState,
    snapshot: motion::State,
    revision: u64,
) -> Result<bool, String> {
    let mut current = state.motion.lock().map_err(|e| e.to_string())?;
    if current.revision != revision {
        return Ok(false);
    }
    *current = snapshot;
    Ok(true)
}

#[tauri::command]
fn walk_desktop(
    target_x: f64,
    duration_ms: f64,
    window: WebviewWindow,
    state: State<'_, DesktopState>,
) -> Result<(), String> {
    if state
        .interaction
        .lock()
        .map_err(|e| e.to_string())?
        .captured
    {
        return Ok(());
    }
    let mut snapshot = state.motion.lock().map_err(|e| e.to_string())?.clone();
    let revision = snapshot.revision;
    motion::walk(&window, &mut snapshot, target_x, duration_ms)?;
    commit_motion(&state, snapshot, revision)?;
    Ok(())
}

#[tauri::command]
fn perch_companion(window: WebviewWindow, state: State<'_, DesktopState>) -> Result<(), String> {
    let mut snapshot = state.motion.lock().map_err(|e| e.to_string())?.clone();
    let revision = snapshot.revision;
    motion::perch(&window, &mut snapshot)?;
    if !commit_motion(&state, snapshot, revision)? {
        return Err("Déplacement interrompu. Réessayez.".into());
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn restore_position(
    window: &WebviewWindow,
    state: &DesktopState,
    reset: bool,
) -> tauri::Result<()> {
    let saved = if reset {
        None
    } else {
        fs::read(&state.position_file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<SavedPosition>(&bytes).ok())
    };
    let monitors = window.available_monitors()?;
    let monitor = saved
        .and_then(|position| {
            monitors
                .iter()
                .find(|monitor| {
                    let area = monitor.work_area();
                    i64::from(position.x) >= i64::from(area.position.x)
                        && i64::from(position.y) >= i64::from(area.position.y)
                        && i64::from(position.x)
                            < i64::from(area.position.x) + i64::from(area.size.width)
                        && i64::from(position.y)
                            < i64::from(area.position.y) + i64::from(area.size.height)
                })
                .cloned()
        })
        .or(window.primary_monitor()?)
        .or(monitors.first().cloned());
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let size = window.outer_size()?;
        let default = SavedPosition {
            x: (i64::from(area.position.x) + i64::from(area.size.width)
                - i64::from(size.width)
                - 24) as i32,
            y: (i64::from(area.position.y) + i64::from(area.size.height)
                - i64::from(size.height)
                - 8) as i32,
        };
        let position = clamp_position(
            saved.unwrap_or(default),
            (
                area.position.x,
                area.position.y,
                area.size.width,
                area.size.height,
            ),
            (size.width, size.height),
        );
        window.set_position(PhysicalPosition::new(position.x, position.y))?;
    }
    Ok(())
}

fn save_position(state: &DesktopState, force: bool) {
    let mut pending = state.position.lock().unwrap();
    if let Some((position, changed)) = *pending {
        if force || changed.elapsed() >= Duration::from_millis(400) {
            // Small independent native settings file; WebView profiles and
            // speech memory remain in their own repository store.
            let result = fs::create_dir_all(state.position_file.parent().unwrap())
                .and_then(|_| fs::write(&state.position_file, serde_json::to_vec(&position)?));
            if let Err(error) = result {
                eprintln!("Cannot save Persona window position: {error}");
            }
            *pending = None;
        }
    }
}

fn start_native_loop(window: WebviewWindow, state: DesktopState) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        let mut escape_was_down = false;
        while state.running.load(Ordering::Relaxed) {
            #[cfg(windows)]
            {
                use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
                    GetAsyncKeyState, VK_ESCAPE, VK_LBUTTON,
                };
                // Observe only the stop key; never consume it or collect typed input.
                let escape_down = unsafe { GetAsyncKeyState(i32::from(VK_ESCAPE)) } < 0;
                if escape_down && !escape_was_down {
                    let _ = window.emit("agent-stop", ());
                }
                escape_was_down = escape_down;
                let (captured, ready, regions, released) = {
                    let mut interaction = state.interaction.lock().unwrap();
                    // Query the global physical button even when the WebView
                    // receives no mouse events (click-through or OS drag).
                    let released = interaction.captured
                        && unsafe { GetAsyncKeyState(i32::from(VK_LBUTTON)) } >= 0;
                    if released {
                        interaction.captured = false;
                    }
                    (
                        interaction.captured,
                        interaction.ready,
                        interaction.regions.clone(),
                        released,
                    )
                };
                if released {
                    let _ = finish_panel_drag(&window, &state);
                }
                // Never hold a state mutex across a Tauri call: its platform
                // implementation may need to dispatch to the UI thread.
                // Panels publish their actual opaque rectangles. A chat panel
                // must not turn the empty area around the avatar into an input trap.
                let ignore = if captured {
                    false
                } else if !ready {
                    true
                } else if let (Ok(cursor), Ok(origin), Ok(scale)) = (
                    window.cursor_position(),
                    window.inner_position(),
                    window.scale_factor(),
                ) {
                    let x = (cursor.x - f64::from(origin.x)) / scale;
                    let y = (cursor.y - f64::from(origin.y)) / scale;
                    !regions.iter().any(|region| region.contains(x, y))
                } else {
                    // Fail open: do not trap clicks above another app.
                    true
                };
                // Reapply at 25 Hz instead of caching: pointer capture and tray
                // commands also change the native flag between polls.
                let _ = window.set_ignore_cursor_events(ignore);
            }
            #[cfg(not(windows))]
            let _ = &window;
            save_position(&state, false);
            std::thread::sleep(Duration::from_millis(40));
        }
    });
}

fn start_motion_loop(window: WebviewWindow, state: DesktopState) {
    std::thread::spawn(move || {
        while state.running.load(Ordering::Relaxed) {
            let blocked = {
                let interaction = state.interaction.lock().unwrap();
                interaction.captured || !interaction.ready
            };
            let menu_open = state.menu_position.lock().unwrap().is_some();
            let blocked = blocked || menu_open || !window.is_visible().unwrap_or(false);
            let mut snapshot = state.motion.lock().unwrap().clone();
            let revision = snapshot.revision;
            let next = motion::tick(&window, &mut snapshot, blocked);
            let accepted = {
                let mut current = state.motion.lock().unwrap();
                if current.revision == revision {
                    *current = snapshot;
                    true
                } else {
                    false
                }
            };
            // Never hold state across a call dispatched to the UI thread.
            if accepted {
                if let Some(pos) = next {
                    let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));
                }
            }
            std::thread::sleep(Duration::from_millis(16));
        }
    });
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            report(show_companion(app, false));
        }))
        .invoke_handler({
            let handler: Box<dyn Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync> =
                Box::new(tauri::generate_handler![
                    desktop_ready,
                    set_launcher_open,
                    set_chat_open,
                    pause_media,
                    agent_service::agent_status,
                    agent_service::agent_pair,
                    agent_service::agent_disconnect,
                    agent_service::agent_step,
                    agent_service::agent_cancel,
                    agent_tools::agent_tool,
                    set_hit_regions,
                    set_pointer_capture,
                    start_dragging,
                    hide_companion,
                    show_settings,
                    quit_app,
                    configure_motion,
                    desktop_world,
                    walk_desktop,
                    perch_companion
                ]);
            move |invoke: tauri::ipc::Invoke<tauri::Wry>| {
                let webview = invoke.message.webview_ref();
                let trusted = webview
                    .url()
                    .map(|url| {
                        agent_service::trusted_companion(
                            webview.label(),
                            &url,
                            cfg!(debug_assertions),
                        )
                    })
                    .unwrap_or(false);
                if !trusted {
                    invoke.resolver.reject(
                        "Application commands are restricted to the bundled Persona companion.",
                    );
                    return true;
                }
                handler(invoke)
            }
        })
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or("Missing companion window")?;
            let state = DesktopState {
                interaction: Arc::new(Mutex::new(Interaction::default())),
                position: Arc::new(Mutex::new(None)),
                running: Arc::new(AtomicBool::new(true)),
                menu_position: Arc::new(Mutex::new(None)),
                panel_drag: Arc::new(Mutex::new(None)),
                motion: Arc::new(Mutex::new(motion::State::default())),
                position_file: app.path().app_config_dir()?.join("window-position.json"),
            };
            app.manage(state.clone());
            app.manage(agent_service::AgentRelay::new()?);
            restore_position(&window, &state, false)?;
            #[cfg(windows)]
            window.set_ignore_cursor_events(true)?;

            let library =
                MenuItem::with_id(app, "library", "Mes compagnons · Créer", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Afficher le compagnon", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Masquer", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Réglages", true, None::<&str>)?;
            let reset = MenuItem::with_id(
                app,
                "reset",
                "Replacer sur l’écran principal",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quitter Persona", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&library, &show, &hide, &settings, &reset, &quit])?;
            // Keep a recovery route for a hidden/click-through window. Any tray
            // creation failure aborts setup instead of leaving an invisible app.
            TrayIconBuilder::with_id("persona")
                .icon(tauri::include_image!("icons/icon.png"))
                .tooltip("Persona — compagnon de bureau")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "library" => {
                        report(show_companion(app, false));
                        if let Some(window) = app.get_webview_window("main") {
                            report(window.emit("desktop-menu", ()));
                        }
                    }
                    "show" => report(show_companion(app, false)),
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            report(window.hide());
                        }
                    }
                    "settings" => report(show_companion(app, true)),
                    "reset" => {
                        app.state::<DesktopState>()
                            .motion
                            .lock()
                            .unwrap()
                            .interrupt(true);
                        if let Some(window) = app.get_webview_window("main") {
                            report(restore_position(
                                &window,
                                &app.state::<DesktopState>(),
                                true,
                            ));
                            report(show_companion(app, false));
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        report(show_companion(tray.app_handle(), false));
                    }
                })
                .build(app)?;

            let event_state = state.clone();
            let event_window = window.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    report(event_window.hide());
                }
                WindowEvent::Moved(position) => {
                    let panel_open = { event_state.menu_position.lock().unwrap().is_some() };
                    if panel_open {
                        let drag = *event_state.panel_drag.lock().unwrap();
                        if let Some((start, companion)) = drag {
                            let mut saved = event_state.menu_position.lock().unwrap();
                            if saved.is_some() {
                                *saved = Some(moved_panel_restore(
                                    start,
                                    SavedPosition {
                                        x: position.x,
                                        y: position.y,
                                    },
                                    companion,
                                ));
                            }
                        }
                        return;
                    }
                    *event_state.position.lock().unwrap() = Some((
                        SavedPosition {
                            x: position.x,
                            y: position.y,
                        },
                        Instant::now(),
                    ));
                }
                _ => {}
            });
            start_motion_loop(window.clone(), state.clone());
            start_native_loop(window, state);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Could not start Persona desktop");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app.state::<DesktopState>();
            state.running.store(false, Ordering::Relaxed);
            save_position(&state, true);
        }
    });
}
