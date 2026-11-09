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
    Played,
    AlreadyPlaying,
}

#[derive(Serialize)]
pub struct PauseResult {
    status: PauseStatus,
}

/// Uses Windows' selected media session. Never sends a play/pause toggle or
/// spacebar to an arbitrary foreground application. No titles/audio are read.
#[cfg(windows)]
fn control(play: bool) -> Result<PauseResult, String> {
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
        let desired = if play {
            Playback::Playing
        } else {
            Playback::Paused
        };
        if status == desired {
            return Ok(if play {
                PauseStatus::AlreadyPlaying
            } else {
                PauseStatus::AlreadyPaused
            });
        }
        if (!play && status != Playback::Playing)
            || (play && status != Playback::Paused && status != Playback::Stopped)
        {
            return Ok(PauseStatus::NotPlaying);
        }
        let accepted = if play {
            session.TryPlayAsync()?.join()?
        } else {
            session.TryPauseAsync()?.join()?
        };
        if !accepted {
            return Ok(PauseStatus::Refused);
        }
        // A successful request alone does not prove playback stopped.
        for _ in 0..12 {
            if session.GetPlaybackInfo()?.PlaybackStatus()? == desired {
                return Ok(if play {
                    PauseStatus::Played
                } else {
                    PauseStatus::Paused
                });
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
fn control(_play: bool) -> Result<PauseResult, String> {
    Err("Le contrôle média nécessite Windows.".into())
}
pub fn pause() -> Result<PauseResult, String> {
    control(false)
}
pub fn play() -> Result<PauseResult, String> {
    control(true)
}
