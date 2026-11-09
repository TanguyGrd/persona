use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PauseStatus {
    Paused,
    AlreadyPaused,
    NoSession,
    NotPlaying,
    Refused,
    Unconfirmed,
}

#[derive(Serialize)]
pub struct PauseResult {
    status: PauseStatus,
}

/// Uses Windows' selected media session. Never sends a play/pause toggle or
/// spacebar to an arbitrary foreground application. No titles/audio are read.
#[cfg(windows)]
pub fn pause() -> Result<PauseResult, String> {
    use std::{thread, time::Duration};
    use windows::{
        Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Playback,
        },
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }
    let result = || -> windows::core::Result<PauseStatus> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }?;
        let _apartment = Apartment;
        let manager = Manager::RequestAsync()?.join()?;
        if manager.GetSessions()?.Size()? == 0 {
            return Ok(PauseStatus::NoSession);
        }
        let session = manager.GetCurrentSession()?;
        let status = session.GetPlaybackInfo()?.PlaybackStatus()?;
        if status == Playback::Paused {
            return Ok(PauseStatus::AlreadyPaused);
        }
        if status != Playback::Playing {
            return Ok(PauseStatus::NotPlaying);
        }
        if !session.TryPauseAsync()?.join()? {
            return Ok(PauseStatus::Refused);
        }
        // A successful request alone does not prove playback stopped.
        for _ in 0..12 {
            if session.GetPlaybackInfo()?.PlaybackStatus()? == Playback::Paused {
                return Ok(PauseStatus::Paused);
            }
            thread::sleep(Duration::from_millis(80));
        }
        Ok(PauseStatus::Unconfirmed)
    };
    result()
        .map(|status| PauseResult { status })
        .map_err(|error| format!("Contrôle média Windows indisponible : {error}"))
}

#[cfg(not(windows))]
pub fn pause() -> Result<PauseResult, String> {
    Err("Le contrôle média nécessite Windows.".into())
}
