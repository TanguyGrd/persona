//! Native desktop movement. No screenshots, window titles, file or audio access.
use crate::geometry::{clamp_position, SavedPosition};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::WebviewWindow;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub enabled: bool,
    pub perching: bool,
    pub paused: bool,
    pub anchor_x: f64,
    pub actor_width: f64,
    pub actor_height: f64,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            perching: false,
            paused: true,
            anchor_x: 160.0,
            actor_width: 116.0,
            actor_height: 116.0,
        }
    }
}
impl Config {
    pub fn valid(&self) -> bool {
        self.anchor_x.is_finite()
            && self.anchor_x.abs() < 4096.0
            && [self.actor_width, self.actor_height]
                .iter()
                .all(|n| n.is_finite() && *n > 0.0 && *n <= 4096.0)
    }
}
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct World {
    pub x: f64,
    pub min_x: f64,
    pub max_x: f64,
    pub on_surface: bool,
    pub can_perch: bool,
}

#[derive(Clone, Copy)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}
#[derive(Clone, Copy)]
pub struct Plan {
    from: SavedPosition,
    to: SavedPosition,
    started: Instant,
    duration_ms: f64,
}
impl Plan {
    fn new(from: SavedPosition, to: SavedPosition, duration_ms: f64) -> Self {
        Self {
            from,
            to,
            started: Instant::now(),
            duration_ms: duration_ms.clamp(200.0, 60000.0),
        }
    }
    fn sample(&self) -> (SavedPosition, bool) {
        sample(
            self.from,
            self.to,
            self.started.elapsed().as_secs_f64() * 1000.0 / self.duration_ms,
        )
    }
}
pub fn sample(from: SavedPosition, to: SavedPosition, progress: f64) -> (SavedPosition, bool) {
    let t = progress.clamp(0.0, 1.0);
    let eased = t * t * (3.0 - 2.0 * t);
    let lerp =
        |a: i32, b: i32| (f64::from(a) + (f64::from(b) - f64::from(a)) * eased).round() as i32;
    (
        SavedPosition {
            x: lerp(from.x, to.x),
            y: lerp(from.y, to.y),
        },
        t >= 1.0,
    )
}

#[derive(Clone)]
pub struct State {
    pub revision: u64,
    pub config: Config,
    plan: Option<Plan>,
    surface: Option<usize>,
    surface_settled: bool,
    last_foreground: Option<usize>,
    last_probe: Instant,
    manual_perch_after: Instant,
}
impl Default for State {
    fn default() -> Self {
        Self {
            revision: 0,
            config: Config::default(),
            plan: None,
            surface: None,
            surface_settled: false,
            last_foreground: None,
            last_probe: Instant::now(),
            manual_perch_after: Instant::now(),
        }
    }
}
impl State {
    pub fn configure(&mut self, config: Config) {
        self.revision = self.revision.wrapping_add(1);
        if !config.enabled || config.paused {
            self.plan = None;
        }
        if !config.perching {
            self.surface = None;
            self.last_foreground = None;
        }
        self.config = config;
    }
    pub fn interrupt(&mut self, manual: bool) {
        self.revision = self.revision.wrapping_add(1);
        self.plan = None;
        if manual {
            self.manual_perch_after = Instant::now() + std::time::Duration::from_secs(20);
            self.surface = None;
        }
    }
}

fn metrics(
    window: &WebviewWindow,
) -> tauri::Result<(tauri::Monitor, f64, SavedPosition, (u32, u32))> {
    let monitor = window
        .current_monitor()?
        .or(window.primary_monitor()?)
        .ok_or_else(|| std::io::Error::other("No desktop monitor available"))?;
    let scale = window.scale_factor()?;
    let pos = window.outer_position()?;
    let size = window.outer_size()?;
    Ok((
        monitor,
        scale,
        SavedPosition { x: pos.x, y: pos.y },
        (size.width, size.height),
    ))
}

#[cfg(windows)]
fn own_handle(window: &WebviewWindow) -> Option<usize> {
    window.hwnd().ok().map(|handle| handle.0 as usize)
}
#[cfg(windows)]
fn foreground() -> Option<usize> {
    let hwnd = unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() };
    if hwnd.is_null() {
        None
    } else {
        Some(hwnd as usize)
    }
}
#[cfg(not(windows))]
fn foreground() -> Option<usize> {
    None
}

#[cfg(windows)]
fn rectangle(handle: usize, window: &WebviewWindow) -> Option<Rect> {
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS},
        UI::WindowsAndMessaging::{GetWindowRect, IsIconic, IsWindow, IsWindowVisible},
    };
    if Some(handle) == own_handle(window) {
        return None;
    }
    let hwnd = handle as *mut std::ffi::c_void;
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    unsafe {
        if IsWindow(hwnd) == 0 || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return None;
        }
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            (&mut rect as *mut RECT).cast(),
            std::mem::size_of::<RECT>() as u32,
        ) < 0
            && GetWindowRect(hwnd, &mut rect) == 0
        {
            return None;
        }
    }
    if i64::from(rect.right) - i64::from(rect.left) < 160
        || i64::from(rect.bottom) - i64::from(rect.top) < 120
    {
        return None;
    }
    Some(Rect {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
    })
}
#[cfg(not(windows))]
fn rectangle(_: usize, _: &WebviewWindow) -> Option<Rect> {
    None
}

fn bounds(
    rect: Rect,
    area: (i32, i32, u32, u32),
    config: Config,
    scale: f64,
) -> Option<(i32, i32, i32)> {
    if rect.bottom <= rect.top {
        return None;
    }
    let left = f64::from(rect.left.max(area.0)) + 8.0;
    let right = f64::from(rect.right).min(f64::from(area.0) + f64::from(area.2))
        - config.actor_width * scale
        - 8.0;
    // The transparent part of our window may extend above a monitor; the whole avatar must stay visible.
    if right < left
        || f64::from(rect.top) < f64::from(area.1) + config.actor_height * scale + 12.0
        || f64::from(rect.top) > f64::from(area.1) + f64::from(area.3)
    {
        return None;
    }
    let offset = config.anchor_x * scale;
    Some((
        (left - offset).round() as i32,
        (right - offset).round() as i32,
        rect.top,
    ))
}

pub fn world(window: &WebviewWindow, state: &State) -> Option<World> {
    if !state.config.enabled || state.config.paused {
        return None;
    }
    let (monitor, scale, pos, size) = metrics(window).ok()?;
    let area = monitor.work_area();
    let origin = area.position.x;
    let (left, right) = state
        .surface
        .and_then(|handle| rectangle(handle, window))
        .and_then(|rect| {
            bounds(
                rect,
                (
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                ),
                state.config,
                scale,
            )
        })
        .map(|(left, right, _)| (left, right))
        .unwrap_or((
            origin,
            origin + area.size.width.saturating_sub(size.0) as i32,
        ));
    Some(World {
        x: f64::from(pos.x - origin) / scale,
        min_x: f64::from(left - origin) / scale,
        max_x: f64::from(right - origin) / scale,
        on_surface: state.surface.is_some(),
        can_perch: state.config.perching
            && state.surface.is_none()
            && Instant::now() >= state.manual_perch_after
            && state
                .last_foreground
                .and_then(|h| rectangle(h, window))
                .and_then(|rect| {
                    bounds(
                        rect,
                        (
                            area.position.x,
                            area.position.y,
                            area.size.width,
                            area.size.height,
                        ),
                        state.config,
                        scale,
                    )
                })
                .is_some(),
    })
}

pub fn walk(
    window: &WebviewWindow,
    state: &mut State,
    target_x: f64,
    duration_ms: f64,
) -> Result<(), String> {
    if !target_x.is_finite() || !duration_ms.is_finite() {
        return Err("Invalid desktop walk".into());
    }
    let Some(world) = world(window, state) else {
        return Ok(());
    };
    let (monitor, scale, pos, _) = metrics(window).map_err(|e| e.to_string())?;
    let x = f64::from(monitor.work_area().position.x)
        + target_x.clamp(world.min_x, world.max_x) * scale;
    state.revision = state.revision.wrapping_add(1);
    state.plan = Some(Plan::new(
        pos,
        SavedPosition {
            x: x.round() as i32,
            y: pos.y,
        },
        duration_ms,
    ));
    Ok(())
}

pub fn perch(window: &WebviewWindow, state: &mut State) -> Result<(), String> {
    if !state.config.perching {
        return Err("Activez d’abord l’utilisation des bords des fenêtres.".into());
    }
    let handle = foreground()
        .filter(|handle| rectangle(*handle, window).is_some())
        .or(state.last_foreground)
        .ok_or("Cliquez d’abord sur une fenêtre ouverte, puis revenez vers le compagnon.")?;
    let rect = rectangle(handle, window).ok_or("Cette fenêtre est fermée, masquée ou réduite.")?;
    let (monitor, scale, pos, size) = metrics(window).map_err(|e| e.to_string())?;
    let area = monitor.work_area();
    let (left, right, top) = bounds(
        rect,
        (
            area.position.x,
            area.position.y,
            area.size.width,
            area.size.height,
        ),
        state.config,
        scale,
    )
    .ok_or("Ce bord est trop haut ou trop étroit pour le personnage.")?;
    state.revision = state.revision.wrapping_add(1);
    state.surface = Some(handle);
    state.surface_settled = false;
    state.plan = Some(Plan::new(
        pos,
        SavedPosition {
            x: pos.x.clamp(left, right),
            y: top - size.1 as i32 + 1,
        },
        1000.0,
    ));
    Ok(())
}

/// Called on the native thread; no frontend IPC for individual animation frames.
pub fn tick(window: &WebviewWindow, state: &mut State, blocked: bool) -> Option<SavedPosition> {
    if blocked || state.config.paused {
        state.plan = None;
        return None;
    }
    if state.config.perching && state.last_probe.elapsed().as_millis() >= 500 {
        if let Some(handle) = foreground().filter(|handle| rectangle(*handle, window).is_some()) {
            state.last_foreground = Some(handle);
        }
        state.last_probe = Instant::now();
    }
    if state.plan.is_none() && state.surface.is_none() {
        return None;
    }
    let (_, scale, pos, size) = metrics(window).ok()?;
    if let Some(handle) = state.surface {
        let target = rectangle(handle, window).and_then(|rect| {
            let (monitor, _, _, _) = metrics(window).ok()?;
            let area = monitor.work_area();
            bounds(
                rect,
                (
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                ),
                state.config,
                scale,
            )
        });
        if let Some((left, right, top)) = target {
            let destination = SavedPosition {
                x: pos.x.clamp(left, right),
                y: top - size.1 as i32 + 1,
            };
            if let Some(plan) = state.plan.as_mut() {
                plan.to.y = destination.y;
                plan.to.x = plan.to.x.clamp(left, right);
            } else if destination != pos {
                if !state.surface_settled {
                    state.plan = Some(Plan::new(pos, destination, 600.0));
                } else {
                    return Some(destination);
                }
            }
        } else {
            state.surface = None;
            if let Ok((monitor, _, _, _)) = metrics(window) {
                let area = monitor.work_area();
                let to = clamp_position(
                    SavedPosition {
                        x: pos.x,
                        y: area.position.y + area.size.height as i32 - size.1 as i32,
                    },
                    (
                        area.position.x,
                        area.position.y,
                        area.size.width,
                        area.size.height,
                    ),
                    size,
                );
                state.plan = Some(Plan::new(pos, to, 600.0));
            }
        }
    }
    if let Some(plan) = state.plan {
        let (next, done) = plan.sample();
        if done {
            state.surface_settled = state.surface.is_some();
            state.plan = None;
        }
        if next != pos {
            return Some(next);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn movement_is_continuous_and_ends_exactly_on_target() {
        let from = SavedPosition { x: -500, y: 300 };
        let to = SavedPosition { x: 900, y: 100 };
        assert_eq!(sample(from, to, 0.0).0, from);
        assert_eq!(sample(from, to, 1.0), (to, true));
        let a = sample(from, to, 0.49).0;
        let b = sample(from, to, 0.50).0;
        assert!(b.x > a.x);
        assert!(b.x - a.x < 30);
        assert_eq!(sample(from, to, 5.0), (to, true));
    }
    #[test]
    fn perches_keep_avatar_visible_and_reject_top_edge_without_room() {
        let config = Config::default();
        assert!(bounds(
            Rect {
                left: 100,
                top: 20,
                right: 900,
                bottom: 600
            },
            (0, 0, 1920, 1040),
            config,
            1.0
        )
        .is_none());
        let (left, right, top) = bounds(
            Rect {
                left: 100,
                top: 300,
                right: 900,
                bottom: 800,
            },
            (0, 0, 1920, 1040),
            config,
            1.5,
        )
        .unwrap();
        assert!(left < right);
        assert_eq!(top, 300);
        assert_eq!(left, 108 - 240);
    }
    #[test]
    fn configuration_rejects_invalid_geometry_and_pause_cancels_path() {
        let mut state = State::default();
        assert!(state.config.valid());
        assert!(!Config {
            actor_width: f64::NAN,
            ..state.config
        }
        .valid());
        state.plan = Some(Plan::new(
            SavedPosition { x: 0, y: 0 },
            SavedPosition { x: 20, y: 20 },
            500.0,
        ));
        state.configure(Config {
            paused: true,
            ..state.config
        });
        assert!(state.plan.is_none());
    }
}
