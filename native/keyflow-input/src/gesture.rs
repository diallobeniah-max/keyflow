//! Hyper-activated pointer gesture engine.
//!
//! Tracks pointer motion while the physical Hyper key is held down (or during
//! tap-to-enter mode). Quantizes motion into 8 cardinal and diagonal sectors,
//! extracts compound directional strokes (e.g. "R", "D", "DR", "UL"), and
//! matches them against configured actions upon Hyper release.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use serde::{Deserialize, Serialize};

static GESTURE_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Returns whether pointer gesture tracking is currently armed or capturing.
pub fn is_active() -> bool {
    GESTURE_ACTIVE.load(Ordering::Relaxed)
}

/// 8-sector directional directions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
    UpRight,
    UpLeft,
    DownRight,
    DownLeft,
}

impl Direction {
    pub fn code(&self) -> &'static str {
        match self {
            Direction::Up => "U",
            Direction::Down => "D",
            Direction::Left => "L",
            Direction::Right => "R",
            Direction::UpRight => "UR",
            Direction::UpLeft => "UL",
            Direction::DownRight => "DR",
            Direction::DownLeft => "DL",
        }
    }

    /// Quantize a 2D delta (dx, dy) where screen dy is downwards into one of 8 directions.
    pub fn from_delta(dx: f64, dy: f64) -> Option<Direction> {
        // dy is screen downwards, invert for standard cartesian plane where +y is up
        let cartesian_y = -dy;
        let dist_sq = dx * dx + dy * dy;
        if dist_sq < 1.0 {
            return None;
        }

        let angle_rad = cartesian_y.atan2(dx);
        let mut angle_deg = angle_rad.to_degrees();
        if angle_deg < 0.0 {
            angle_deg += 360.0;
        }

        // Sectors: 8 sectors of 45 degrees centered on 0, 45, 90, 135, 180, 225, 270, 315
        if angle_deg >= 337.5 || angle_deg < 22.5 {
            Some(Direction::Right)
        } else if angle_deg >= 22.5 && angle_deg < 67.5 {
            Some(Direction::UpRight)
        } else if angle_deg >= 67.5 && angle_deg < 112.5 {
            Some(Direction::Up)
        } else if angle_deg >= 112.5 && angle_deg < 157.5 {
            Some(Direction::UpLeft)
        } else if angle_deg >= 157.5 && angle_deg < 202.5 {
            Some(Direction::Left)
        } else if angle_deg >= 202.5 && angle_deg < 247.5 {
            Some(Direction::DownLeft)
        } else if angle_deg >= 247.5 && angle_deg < 292.5 {
            Some(Direction::Down)
        } else {
            Some(Direction::DownRight)
        }
    }
}

/// A configured gesture mapping from stroke code to shortcut action ID.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GestureMapping {
    pub id: String,
    pub name: String,
    pub stroke: String,
    #[serde(default)]
    pub action_id: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// Gesture configuration received from Electron.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GestureConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_activation_threshold")]
    pub activation_threshold: u32,
    #[serde(default = "default_segment_length")]
    pub segment_length: u32,
    #[serde(default = "default_true")]
    pub show_trail: bool,
    #[serde(default = "default_true")]
    pub show_preview: bool,
    #[serde(default)]
    pub tap_to_enter_mode: bool,
    #[serde(default = "default_tap_timeout_ms")]
    pub tap_to_enter_timeout_ms: u32,
    #[serde(default)]
    pub gestures: Vec<GestureMapping>,
}

fn default_activation_threshold() -> u32 {
    24
}

fn default_segment_length() -> u32 {
    35
}

fn default_tap_timeout_ms() -> u32 {
    2000
}

impl Default for GestureConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            activation_threshold: default_activation_threshold(),
            segment_length: default_segment_length(),
            show_trail: true,
            show_preview: true,
            tap_to_enter_mode: false,
            tap_to_enter_timeout_ms: default_tap_timeout_ms(),
            gestures: default_gesture_mappings(),
        }
    }
}

pub fn default_gesture_mappings() -> Vec<GestureMapping> {
    vec![
        GestureMapping {
            id: "gesture-left-back".to_string(),
            name: "Back".to_string(),
            stroke: "L".to_string(),
            action_id: Some("action-browser-back".to_string()),
            enabled: true,
        },
        GestureMapping {
            id: "gesture-right-forward".to_string(),
            name: "Forward".to_string(),
            stroke: "R".to_string(),
            action_id: Some("action-browser-forward".to_string()),
            enabled: true,
        },
        GestureMapping {
            id: "gesture-up-maximize".to_string(),
            name: "Maximize Window".to_string(),
            stroke: "U".to_string(),
            action_id: Some("action-window-maximize".to_string()),
            enabled: true,
        },
        GestureMapping {
            id: "gesture-down-minimize".to_string(),
            name: "Minimize Window".to_string(),
            stroke: "D".to_string(),
            action_id: Some("action-window-minimize".to_string()),
            enabled: true,
        },
        GestureMapping {
            id: "gesture-dr-close".to_string(),
            name: "Close Window / Tab".to_string(),
            stroke: "DR".to_string(),
            action_id: Some("action-window-close".to_string()),
            enabled: true,
        },
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GestureState {
    Idle,
    Armed,
    Capturing,
    Cancelled,
}

/// Point on screen for gesture trails.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Point2D {
    pub x: i32,
    pub y: i32,
}

pub struct GestureTracker {
    config: GestureConfig,
    state: GestureState,
    start_pos: Option<Point2D>,
    last_pivot: Option<Point2D>,
    current_pos: Option<Point2D>,
    points: Vec<Point2D>,
    segments: Vec<Direction>,
    started_at: Option<Duration>,
    tap_to_enter_expires_at: Option<Duration>,
}

impl GestureTracker {
    pub fn new() -> Self {
        Self {
            config: GestureConfig::default(),
            state: GestureState::Idle,
            start_pos: None,
            last_pivot: None,
            current_pos: None,
            points: Vec::with_capacity(256),
            segments: Vec::with_capacity(8),
            started_at: None,
            tap_to_enter_expires_at: None,
        }
    }

    pub fn set_config(&mut self, config: GestureConfig) {
        self.config = config;
        if !self.config.enabled {
            self.reset();
        }
    }

    pub fn config(&self) -> &GestureConfig {
        &self.config
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn state(&self) -> GestureState {
        self.state
    }

    pub fn is_armed(&self) -> bool {
        self.state == GestureState::Armed || self.state == GestureState::Capturing
    }

    pub fn is_capturing(&self) -> bool {
        self.state == GestureState::Capturing
    }

    /// Arm the tracker when Hyper is physically pressed down.
    pub fn arm(&mut self, x: i32, y: i32, at: Duration) {
        if !self.config.enabled {
            return;
        }
        GESTURE_ACTIVE.store(true, Ordering::SeqCst);
        let pt = Point2D { x, y };
        self.state = GestureState::Armed;
        self.start_pos = Some(pt);
        self.last_pivot = Some(pt);
        self.current_pos = Some(pt);
        self.points.clear();
        self.points.push(pt);
        self.segments.clear();
        self.started_at = Some(at);
    }

    /// Arm tap-to-enter mode explicitly.
    pub fn arm_tap_to_enter(&mut self, x: i32, y: i32, at: Duration) {
        if !self.config.enabled {
            return;
        }
        self.arm(x, y, at);
        let timeout = Duration::from_millis(self.config.tap_to_enter_timeout_ms as u64);
        self.tap_to_enter_expires_at = Some(at + timeout);
    }

    /// Update with pointer movement. Returns `true` if this move broke the deadzone
    /// threshold and transitioned to `Capturing` (indicating Hyper tap should be cancelled).
    pub fn on_pointer_move(&mut self, x: i32, y: i32, at: Duration) -> bool {
        if self.state == GestureState::Idle || self.state == GestureState::Cancelled {
            return false;
        }

        // Check tap-to-enter timeout
        if let Some(exp) = self.tap_to_enter_expires_at {
            if at >= exp {
                self.reset();
                return false;
            }
        }

        let pt = Point2D { x, y };
        self.current_pos = Some(pt);

        let Some(start) = self.start_pos else { return false; };
        let dx_start = (pt.x - start.x) as f64;
        let dy_start = (pt.y - start.y) as f64;
        let dist_from_start = (dx_start * dx_start + dy_start * dy_start).sqrt();

        let mut broke_threshold = false;
        if self.state == GestureState::Armed {
            if dist_from_start >= self.config.activation_threshold as f64 {
                self.state = GestureState::Capturing;
                broke_threshold = true;
            } else {
                return false;
            }
        }

        // Add point to trail if it moved at least 3px
        if let Some(last) = self.points.last() {
            let pdx = (pt.x - last.x).abs();
            let pdy = (pt.y - last.y).abs();
            if pdx >= 3 || pdy >= 3 {
                self.points.push(pt);
            }
        } else {
            self.points.push(pt);
        }

        // Check directional segment from pivot
        let Some(pivot) = self.last_pivot else { return broke_threshold; };
        let dx_pivot = (pt.x - pivot.x) as f64;
        let dy_pivot = (pt.y - pivot.y) as f64;
        let dist_from_pivot = (dx_pivot * dx_pivot + dy_pivot * dy_pivot).sqrt();

        if dist_from_pivot >= self.config.segment_length as f64 {
            if let Some(dir) = Direction::from_delta(dx_pivot, dy_pivot) {
                if let Some(last_dir) = self.segments.last().copied() {
                    if last_dir == dir {
                        // Same direction: advance pivot point
                        self.last_pivot = Some(pt);
                    } else if self.segments.len() < 4 {
                        // Direction change: append new segment
                        self.segments.push(dir);
                        self.last_pivot = Some(pt);
                    }
                } else {
                    // First directional segment
                    self.segments.push(dir);
                    self.last_pivot = Some(pt);
                }
            }
        }

        broke_threshold
    }

    /// Cancel the current gesture without firing any action (keyboard chord, Escape, etc.).
    pub fn cancel(&mut self) {
        GESTURE_ACTIVE.store(false, Ordering::SeqCst);
        self.state = GestureState::Cancelled;
        self.points.clear();
        self.segments.clear();
        self.start_pos = None;
        self.last_pivot = None;
        self.current_pos = None;
        self.tap_to_enter_expires_at = None;
    }

    /// Reset to idle.
    pub fn reset(&mut self) {
        GESTURE_ACTIVE.store(false, Ordering::SeqCst);
        self.state = GestureState::Idle;
        self.points.clear();
        self.segments.clear();
        self.start_pos = None;
        self.last_pivot = None;
        self.current_pos = None;
        self.started_at = None;
        self.tap_to_enter_expires_at = None;
    }

    /// Current recognized stroke code string (e.g. "R", "DR", "U", "L").
    pub fn current_stroke_code(&self) -> String {
        // If segments are recognized, join them
        if !self.segments.is_empty() {
            let mut s = String::with_capacity(8);
            for d in &self.segments {
                s.push_str(d.code());
            }
            return s;
        }

        // If in Capturing mode but no formal segment reached yet, evaluate direction from start
        if self.state == GestureState::Capturing {
            if let (Some(start), Some(curr)) = (self.start_pos, self.current_pos) {
                let dx = (curr.x - start.x) as f64;
                let dy = (curr.y - start.y) as f64;
                if let Some(dir) = Direction::from_delta(dx, dy) {
                    return dir.code().to_string();
                }
            }
        }

        String::new()
    }

    /// Finish gesture on Hyper key release. Returns matched mapping if recognized.
    pub fn finish_on_release(&mut self) -> Option<GestureMapping> {
        if self.state != GestureState::Capturing {
            self.reset();
            return None;
        }

        let stroke = self.current_stroke_code();
        self.reset();

        if stroke.is_empty() {
            return None;
        }

        // Find match in configured gestures
        for g in &self.config.gestures {
            if g.enabled && g.stroke.eq_ignore_ascii_case(&stroke) {
                return Some(g.clone());
            }
        }

        None
    }

    pub fn points(&self) -> &[Point2D] {
        &self.points
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_direction_from_delta_cardinals() {
        assert_eq!(Direction::from_delta(50.0, 0.0), Some(Direction::Right));
        assert_eq!(Direction::from_delta(-50.0, 0.0), Some(Direction::Left));
        assert_eq!(Direction::from_delta(0.0, -50.0), Some(Direction::Up)); // screen -y is up
        assert_eq!(Direction::from_delta(0.0, 50.0), Some(Direction::Down)); // screen +y is down
    }

    #[test]
    fn test_direction_from_delta_diagonals() {
        assert_eq!(Direction::from_delta(50.0, -50.0), Some(Direction::UpRight));
        assert_eq!(Direction::from_delta(-50.0, -50.0), Some(Direction::UpLeft));
        assert_eq!(Direction::from_delta(50.0, 50.0), Some(Direction::DownRight));
        assert_eq!(Direction::from_delta(-50.0, 50.0), Some(Direction::DownLeft));
    }

    #[test]
    fn test_deadzone_threshold() {
        let mut tracker = GestureTracker::new();
        let mut cfg = GestureConfig::default();
        cfg.enabled = true;
        cfg.activation_threshold = 20;
        tracker.set_config(cfg);

        tracker.arm(100, 100, Duration::from_millis(100));
        assert_eq!(tracker.state(), GestureState::Armed);

        // Move 10px: below threshold
        let broke = tracker.on_pointer_move(110, 100, Duration::from_millis(120));
        assert!(!broke);
        assert_eq!(tracker.state(), GestureState::Armed);

        // Move another 15px (total 25px): exceeds 20px threshold
        let broke = tracker.on_pointer_move(125, 100, Duration::from_millis(140));
        assert!(broke);
        assert_eq!(tracker.state(), GestureState::Capturing);
    }

    #[test]
    fn test_stroke_recognition_and_match() {
        let mut tracker = GestureTracker::new();
        let mut cfg = GestureConfig::default();
        cfg.enabled = true;
        cfg.activation_threshold = 20;
        cfg.segment_length = 30;
        tracker.set_config(cfg);

        tracker.arm(100, 100, Duration::from_millis(100));

        // Move Right 100px
        tracker.on_pointer_move(150, 100, Duration::from_millis(120));
        tracker.on_pointer_move(200, 100, Duration::from_millis(140));

        assert_eq!(tracker.current_stroke_code(), "R");

        let matched = tracker.finish_on_release();
        assert!(matched.is_some());
        assert_eq!(matched.unwrap().stroke, "R");
    }

    #[test]
    fn test_compound_two_segment_gesture() {
        let mut tracker = GestureTracker::new();
        let mut cfg = GestureConfig::default();
        cfg.enabled = true;
        cfg.activation_threshold = 20;
        cfg.segment_length = 30;
        tracker.set_config(cfg);

        tracker.arm(100, 100, Duration::from_millis(100));

        // Move Down 60px (screen +y)
        tracker.on_pointer_move(100, 160, Duration::from_millis(120));
        // Move Right 60px
        tracker.on_pointer_move(160, 160, Duration::from_millis(140));

        assert_eq!(tracker.current_stroke_code(), "DR");

        let matched = tracker.finish_on_release();
        assert!(matched.is_some());
        assert_eq!(matched.unwrap().stroke, "DR");
    }

    #[test]
    fn test_cancel_on_chord_or_escape() {
        let mut tracker = GestureTracker::new();
        let mut cfg = GestureConfig::default();
        cfg.enabled = true;
        tracker.set_config(cfg);

        tracker.arm(100, 100, Duration::from_millis(100));
        tracker.on_pointer_move(200, 100, Duration::from_millis(150));
        assert_eq!(tracker.state(), GestureState::Capturing);

        // Escape pressed or keyboard chord pressed
        tracker.cancel();
        assert_eq!(tracker.state(), GestureState::Cancelled);

        let matched = tracker.finish_on_release();
        assert!(matched.is_none());
    }

    #[test]
    fn test_sub_threshold_release_returns_none() {
        let mut tracker = GestureTracker::new();
        let mut cfg = GestureConfig::default();
        cfg.enabled = true;
        cfg.activation_threshold = 30;
        tracker.set_config(cfg);

        tracker.arm(100, 100, Duration::from_millis(100));
        tracker.on_pointer_move(105, 102, Duration::from_millis(110)); // tiny 5px move
        assert_eq!(tracker.state(), GestureState::Armed);

        let matched = tracker.finish_on_release();
        assert!(matched.is_none());
        assert_eq!(tracker.state(), GestureState::Idle);
    }
}
