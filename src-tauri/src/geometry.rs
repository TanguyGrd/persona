use serde::{Deserialize, Serialize};

/// Logical CSS coordinates in the WebView, not desktop physical pixels.
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct HitRegion {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl HitRegion {
    pub fn valid(&self) -> bool {
        [self.x, self.y, self.width, self.height]
            .iter()
            .all(|n| n.is_finite() && n.abs() <= 10_000.0)
            && self.width > 0.0
            && self.height > 0.0
    }

    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.width && y < self.y + self.height
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct SavedPosition {
    pub x: i32,
    pub y: i32,
}

/// Clamp the whole window to a monitor's work area (which excludes the taskbar).
pub fn clamp_position(
    pos: SavedPosition,
    area: (i32, i32, u32, u32),
    size: (u32, u32),
) -> SavedPosition {
    let (x, y, width, height) = area;
    let right = i64::from(x) + i64::from(width.saturating_sub(size.0));
    let bottom = i64::from(y) + i64::from(height.saturating_sub(size.1));
    SavedPosition {
        x: i64::from(pos.x).clamp(i64::from(x), right) as i32,
        y: i64::from(pos.y).clamp(i64::from(y), bottom) as i32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hit_regions_use_logical_coordinates_and_exclude_far_edges() {
        let hit = HitRegion {
            x: 20.0,
            y: 40.0,
            width: 100.0,
            height: 120.0,
        };
        assert!(hit.valid());
        assert!(hit.contains(20.0, 40.0));
        assert!(hit.contains(119.0, 159.0));
        assert!(!hit.contains(120.0, 160.0));
        assert!(!HitRegion {
            width: f64::NAN,
            ..hit
        }
        .valid());
    }

    #[test]
    fn recovers_disconnected_monitor_position_without_covering_taskbar() {
        assert_eq!(
            clamp_position(
                SavedPosition { x: -1500, y: 1400 },
                (0, 0, 1920, 1040),
                (360, 320)
            ),
            SavedPosition { x: 0, y: 720 }
        );
    }

    #[test]
    fn handles_negative_monitor_origin_and_work_area_smaller_than_window() {
        assert_eq!(
            clamp_position(
                SavedPosition { x: -5000, y: -100 },
                (-1920, 40, 1920, 1000),
                (360, 320)
            ),
            SavedPosition { x: -1920, y: 40 }
        );
        assert_eq!(
            clamp_position(SavedPosition { x: 50, y: 70 }, (0, 0, 200, 200), (360, 320)),
            SavedPosition { x: 0, y: 0 }
        );
    }
}
