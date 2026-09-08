//! Windows Precision Touchpad (PTP) observation & macOS-inspired 3-finger drag.
//!
//! Uses Win32 Raw Input with Digitizer Usage Page 0x0D and Usage 0x05 (Touch Pad).
//! Provides honest hardware capability detection, multi-touch contact tracking,
//! left-button drag synthesis, and a Mac-style grace period for finger repositioning.
//!
//! Architecture ported and adapted from macOS Accessibility Pointer Control and
//! ClementGre/ThreeFingerDragOnWindows:
//! - ContactsManager: Multi-touch frame reassembly for both single-report and sequential burst touchpads.
//! - DistanceManager: 40ms touch-down quarantine to eliminate initial capacitive roll (bottom-right drift),
//!   longest-moving contact tracking, speed scaling, and smooth sigmoid velocity acceleration.
//! - FingerCounter: Start/stop movement thresholds for deliberate drag initiation.
//! - Subpixel decimal accumulator and configurable cursor averaging.

use std::collections::HashMap;
use std::mem::size_of;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use serde::{Deserialize, Serialize};

static TOUCHPAD_ENABLED: AtomicBool = AtomicBool::new(false);

pub fn is_enabled() -> bool {
    TOUCHPAD_ENABLED.load(Ordering::Relaxed)
}

use windows_sys::Win32::Foundation::{HANDLE, HWND};
use windows_sys::Win32::UI::Input::{
    GetRawInputDeviceInfoW, GetRawInputDeviceList, RegisterRawInputDevices,
    RAWINPUTDEVICE, RAWINPUTDEVICELIST, RIDEV_INPUTSINK, RIDI_DEVICEINFO,
    RIDI_PREPARSEDDATA, RID_DEVICE_INFO, RIM_TYPEHID,
};
use windows_sys::Win32::Devices::HumanInterfaceDevice::{
    HidP_GetCaps, HidP_GetValueCaps, HidP_GetUsageValue,
    HIDP_CAPS, HIDP_VALUE_CAPS, HidP_Input, HIDP_STATUS_SUCCESS,
};

use crate::inject;

/// Contact coordinates from a Precision Touchpad.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TouchpadContact {
    pub id: i32,
    pub x: i32,
    pub y: i32,
}

impl TouchpadContact {
    pub fn dist_2d(&self, other: &Self) -> f32 {
        let dx = (self.x - other.x) as f32;
        let dy = (self.y - other.y) as f32;
        (dx * dx + dy * dy).sqrt()
    }
}

/// Fine-tuning configuration for Three-Finger Dragging mirroring macOS and ThreeFingerDragOnWindows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TouchpadDragConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub cursor_move: bool,
    #[serde(default = "default_speed")]
    pub speed: f32,
    #[serde(default = "default_acceleration")]
    pub acceleration: f32,
    #[serde(default = "default_start_threshold", alias = "movementThreshold")]
    pub start_threshold: u32,
    #[serde(default = "default_stop_threshold")]
    pub stop_threshold: u32,
    #[serde(default = "default_release_delay_ms", alias = "gracePeriodMs")]
    pub release_delay_ms: u32,
    #[serde(default = "default_true")]
    pub allow_release_and_restart: bool,
    #[serde(default = "default_max_finger_distance")]
    pub max_finger_distance: u32,
    #[serde(default = "default_cursor_averaging")]
    pub cursor_averaging: u32,
}

fn default_true() -> bool {
    true
}

fn default_speed() -> f32 {
    30.0
}

fn default_acceleration() -> f32 {
    10.0
}

fn default_start_threshold() -> u32 {
    100
}

fn default_stop_threshold() -> u32 {
    10
}

fn default_release_delay_ms() -> u32 {
    500
}

fn default_max_finger_distance() -> u32 {
    150
}

fn default_cursor_averaging() -> u32 {
    1
}

impl TouchpadDragConfig {
    pub const DEFAULT: Self = Self {
        enabled: false,
        cursor_move: true,
        speed: 30.0,
        acceleration: 10.0,
        start_threshold: 100,
        stop_threshold: 10,
        release_delay_ms: 500,
        allow_release_and_restart: true,
        max_finger_distance: 150,
        cursor_averaging: 1,
    };
}

impl Default for TouchpadDragConfig {
    fn default() -> Self {
        Self::DEFAULT
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DragState {
    Idle,
    Armed,
    Dragging,
    GracePeriod,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DragEvent {
    Started,
    Moved { dx: i32, dy: i32 },
    GracePeriodEntered,
    Stopped { reason: &'static str },
}

/// Manages multi-touch frame reassembly across sequential partial-burst HID packets.
pub struct ContactsManager {
    last_contacts: Vec<TouchpadContact>,
    target_contact_count: u32,
}

impl ContactsManager {
    pub const fn new() -> Self {
        Self {
            last_contacts: Vec::new(),
            target_contact_count: 0,
        }
    }

    /// Process raw parsed contacts and reported contact count.
    /// Returns Some(complete_frame) when a full frame is assembled.
    pub fn receive_contacts(&mut self, mut contacts: Vec<TouchpadContact>, count: u32) -> Option<Vec<TouchpadContact>> {
        if contacts.is_empty() {
            return None;
        }

        // Regular full contact list
        if count == contacts.len() as u32 {
            self.last_contacts.clear();
            self.target_contact_count = 0;
            return Some(contacts);
        }

        // Partial contact list (continuation packet)
        if count == 0 {
            for c in contacts {
                if !self.last_contacts.iter().any(|existing| existing.id == c.id) {
                    self.last_contacts.push(c);
                }
            }

            if self.target_contact_count == 0 {
                return None;
            }

            if self.last_contacts.len() >= self.target_contact_count as usize {
                self.last_contacts.truncate(self.target_contact_count as usize);
                let full = std::mem::take(&mut self.last_contacts);
                self.target_contact_count = 0;
                return Some(full);
            }
            return None;
        }

        // Old partial contact list not submitted yet - flush or clamp
        let mut flushed = None;
        if !self.last_contacts.is_empty() {
            if self.last_contacts.len() < self.target_contact_count as usize {
                if let Some(&last) = self.last_contacts.last() {
                    let max_id = self.last_contacts.iter().map(|c| c.id).max().unwrap_or(0);
                    let missing = self.target_contact_count as usize - self.last_contacts.len();
                    for i in 1..=missing {
                        self.last_contacts.push(TouchpadContact {
                            id: max_id + i as i32,
                            x: last.x,
                            y: last.y,
                        });
                    }
                }
            } else if self.last_contacts.len() > self.target_contact_count as usize {
                self.last_contacts.truncate(self.target_contact_count as usize);
            }
            flushed = Some(std::mem::take(&mut self.last_contacts));
        }

        // Regular contact list with more contacts than expected (clamped)
        if count <= contacts.len() as u32 {
            contacts.truncate(count as usize);
            self.last_contacts.clear();
            self.target_contact_count = 0;
            return Some(contacts);
        }

        // Incomplete contact list (first packet of burst)
        self.target_contact_count = count;
        self.last_contacts = contacts;
        flushed
    }

    pub fn check_timeout(&mut self, at: Duration, last_report_at: Duration) {
        if self.target_contact_count > 0 && at.saturating_sub(last_report_at) > Duration::from_millis(50) {
            self.clear();
        }
    }

    pub fn clear(&mut self) {
        self.last_contacts.clear();
        self.target_contact_count = 0;
    }
}

/// Tracks contact displacements with a 40ms touch-down quarantine to eliminate capacitive settling roll.
pub struct DistanceManager {
    quarantine_contacts: HashMap<i32, Duration>,
    trusted_contacts: Vec<i32>,
}

impl DistanceManager {
    pub fn new() -> Self {
        Self {
            quarantine_contacts: HashMap::new(),
            trusted_contacts: Vec::new(),
        }
    }

    pub fn reset(&mut self) {
        self.quarantine_contacts.clear();
        self.trusted_contacts.clear();
    }

    /// Find the longest distance between two TouchpadContact of same ID.
    /// New contacts are quarantined for 40ms before their displacement can affect cursor motion.
    /// Returns (longest_dist_id, dx, dy, longest_dist_2d).
    pub fn get_longest_dist_2d(
        &mut self,
        old_contacts: &[TouchpadContact],
        new_contacts: &[TouchpadContact],
        has_fingers_released: bool,
        at: Duration,
    ) -> (i32, i32, i32, f32) {
        if has_fingers_released {
            self.reset();
            return (0, 0, 0, 0.0);
        }

        // Remove contacts that don't exist anymore
        self.trusted_contacts.retain(|c| new_contacts.iter().any(|nc| nc.id == *c));
        self.quarantine_contacts.retain(|k, _| new_contacts.iter().any(|nc| nc.id == *k));

        // Add / promote contacts through quarantine
        for new_contact in new_contacts {
            if self.trusted_contacts.contains(&new_contact.id) {
                continue;
            }
            if let Some(&first_seen) = self.quarantine_contacts.get(&new_contact.id) {
                // Quarantine of 40ms eliminates landing capacitance noise and initial finger roll
                if at.saturating_sub(first_seen) >= Duration::from_millis(40) {
                    self.trusted_contacts.push(new_contact.id);
                    self.quarantine_contacts.remove(&new_contact.id);
                }
            } else {
                self.quarantine_contacts.insert(new_contact.id, at);
            }
        }

        let mut longest_dist_2d = 0.0f32;
        let mut longest_dist_id = 0i32;
        let mut longest_dist_dx = 0i32;
        let mut longest_dist_dy = 0i32;

        for new_contact in new_contacts {
            if !self.trusted_contacts.contains(&new_contact.id) {
                continue;
            }

            for old_contact in old_contacts {
                if new_contact.id != old_contact.id {
                    continue;
                }

                let dist_2d = new_contact.dist_2d(old_contact);
                if dist_2d > longest_dist_2d {
                    longest_dist_2d = dist_2d;
                    longest_dist_id = new_contact.id;
                    longest_dist_dx = new_contact.x - old_contact.x;
                    longest_dist_dy = new_contact.y - old_contact.y;
                }
                break;
            }
        }

        (longest_dist_id, longest_dist_dx, longest_dist_dy, longest_dist_2d)
    }

    /// Apply speed scaling and sigmoid velocity acceleration curve matching ThreeFingerDragOnWindows.
    pub fn apply_speed_and_acc(
        dx: f32,
        dy: f32,
        elapsed_ms: u64,
        speed: f32,
        acceleration: f32,
    ) -> (f32, f32) {
        let elapsed = (elapsed_ms.max(1) as f32).max(1.0);

        // Apply Speed: base divisor 120.0
        let speed_factor = speed / 120.0;
        let mut scaled_dx = dx * speed_factor;
        let mut scaled_dy = dy * speed_factor;

        let len = (scaled_dx * scaled_dx + scaled_dy * scaled_dy).sqrt();
        let mut mouse_velocity = (len / elapsed).min(4.0);
        if mouse_velocity.is_nan() || mouse_velocity.is_infinite() {
            mouse_velocity = 1.0;
        }

        let mut pointer_velocity = 1.0f32;
        let a = acceleration / 10.0;
        if a != 0.0 {
            // Sigmoid acceleration: 0.7 + 0.8 * sigmoid(2.6 * a * (v - 1) - log2(0.8/0.3 - 1))
            const LOG2_TERM: f64 = 0.736_965_594_166_206_2;
            let exponent = 2.6 * (a as f64) * ((mouse_velocity as f64) - 1.0) - LOG2_TERM;
            let sigmoid = 1.0 / (1.0 + (-exponent).exp());
            pointer_velocity = (0.7 + 0.8 * sigmoid) as f32;
        }

        scaled_dx *= pointer_velocity;
        scaled_dy *= pointer_velocity;

        (scaled_dx, scaled_dy)
    }

    /// Apply speed to 2D distance for threshold tracking: distance * (speed / 60.0).
    pub fn apply_speed(distance: f32, speed: f32) -> f32 {
        distance * (speed / 60.0)
    }
}

/// Determines the number of intentionally moving fingers before activating dragging.
pub struct FingerCounter {
    original_fingers_count: usize,
    short_delay_fingers_count: usize,
    short_delay_fingers_move: f32,
    long_delay_fingers_count: usize,
    long_delay_fingers_move: f32,
}

impl FingerCounter {
    pub const fn new() -> Self {
        Self {
            original_fingers_count: 0,
            short_delay_fingers_count: 0,
            short_delay_fingers_move: 0.0,
            long_delay_fingers_count: 0,
            long_delay_fingers_move: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.original_fingers_count = 0;
        self.short_delay_fingers_count = 0;
        self.short_delay_fingers_move = 0.0;
        self.long_delay_fingers_count = 0;
        self.long_delay_fingers_move = 0.0;
    }

    pub fn count_moving_fingers(
        &mut self,
        new_contacts: &[TouchpadContact],
        are_contacts_ids_commons: bool,
        mut longest_dist_2d: f32,
        has_fingers_released: bool,
        config: &TouchpadDragConfig,
    ) -> (usize, usize, usize, usize) {
        if !are_contacts_ids_commons && (new_contacts.len() <= 1 || has_fingers_released) {
            self.original_fingers_count = 0;
        }
        if !are_contacts_ids_commons || has_fingers_released {
            self.short_delay_fingers_move = 0.0;
            self.long_delay_fingers_move = 0.0;
            return (0, self.short_delay_fingers_count, self.long_delay_fingers_count, self.original_fingers_count);
        }

        longest_dist_2d = DistanceManager::apply_speed(longest_dist_2d, config.speed);
        if longest_dist_2d >= 1.0 {
            self.short_delay_fingers_move += longest_dist_2d;
            self.long_delay_fingers_move += longest_dist_2d;
        }

        if self.short_delay_fingers_move >= config.stop_threshold as f32 {
            self.short_delay_fingers_count = new_contacts.len();
            self.short_delay_fingers_move = 0.0;
        }

        if self.long_delay_fingers_move > config.start_threshold as f32 {
            self.long_delay_fingers_count = new_contacts.len();
            self.long_delay_fingers_move = 0.0;
            if self.original_fingers_count <= 1 {
                self.original_fingers_count = new_contacts.len();
            }
        }

        (
            new_contacts.len(),
            self.short_delay_fingers_count,
            self.long_delay_fingers_count,
            self.original_fingers_count,
        )
    }

    pub fn are_contacts_ids_commons(old_contacts: &[TouchpadContact], new_contacts: &[TouchpadContact]) -> bool {
        if old_contacts.len() != new_contacts.len() {
            return false;
        }
        let mut count = 0;
        for nc in new_contacts {
            for oc in old_contacts {
                if nc.id == oc.id {
                    count += 1;
                    break;
                }
            }
        }
        count == new_contacts.len()
    }
}

pub struct ThreeFingerDragEngine {
    config: TouchpadDragConfig,
    state: DragState,
    distance_manager: DistanceManager,
    finger_counter: FingerCounter,
    prev_contacts: Vec<TouchpadContact>,
    last_contact_at: Duration,
    is_dragging: bool,
    grace_deadline: Option<Duration>,
    decimal_x: f32,
    decimal_y: f32,
    averaging_x: f32,
    averaging_y: f32,
    averaging_count: u32,
}

impl ThreeFingerDragEngine {
    pub fn new() -> Self {
        Self {
            config: TouchpadDragConfig::DEFAULT,
            state: DragState::Idle,
            distance_manager: DistanceManager::new(),
            finger_counter: FingerCounter::new(),
            prev_contacts: Vec::new(),
            last_contact_at: Duration::from_millis(0),
            is_dragging: false,
            grace_deadline: None,
            decimal_x: 0.0,
            decimal_y: 0.0,
            averaging_x: 0.0,
            averaging_y: 0.0,
            averaging_count: 0,
        }
    }

    pub fn set_config(&mut self, config: TouchpadDragConfig) {
        self.config = config;
        if !self.config.enabled {
            self.cancel();
        }
    }

    pub fn config(&self) -> &TouchpadDragConfig {
        &self.config
    }

    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn state(&self) -> DragState {
        self.state
    }

    pub fn is_dragging(&self) -> bool {
        self.is_dragging
    }

    /// Process incoming touch contacts at absolute timestamp `at`.
    pub fn on_contacts(&mut self, contacts: &[TouchpadContact], at: Duration) -> Option<DragEvent> {
        if !self.config.enabled {
            return None;
        }

        let elapsed = if self.last_contact_at.is_zero() {
            Duration::from_millis(10)
        } else {
            at.saturating_sub(self.last_contact_at)
        };
        self.last_contact_at = at;

        let has_fingers_released = elapsed > Duration::from_millis(40);
        let are_contacts_ids_commons = FingerCounter::are_contacts_ids_commons(&self.prev_contacts, contacts);

        let (_longest_id, longest_dx, longest_dy, longest_dist_2d) =
            self.distance_manager.get_longest_dist_2d(&self.prev_contacts, contacts, has_fingers_released, at);

        let (fingers_count, short_delay_moving, long_delay_moving, original_fingers) =
            self.finger_counter.count_moving_fingers(
                contacts,
                are_contacts_ids_commons,
                longest_dist_2d,
                has_fingers_released,
                &self.config,
            );

        // Update prev_contacts
        self.prev_contacts = contacts.to_vec();

        if contacts.is_empty() {
            // Fingers lifted
            if self.is_dragging {
                if self.config.allow_release_and_restart && self.config.release_delay_ms > 0 {
                    self.state = DragState::GracePeriod;
                    let delay = Duration::from_millis(self.config.release_delay_ms as u64);
                    self.grace_deadline = Some(at + delay);
                    return Some(DragEvent::GracePeriodEntered);
                } else {
                    return self.stop_drag("fingers_lifted");
                }
            } else if self.state == DragState::Armed {
                self.reset();
                return Some(DragEvent::Stopped { reason: "lift_before_threshold" });
            } else {
                return None;
            }
        }

        // If in grace period and fingers return, resume dragging seamlessly
        if self.state == DragState::GracePeriod && contacts.len() >= 2 {
            self.state = DragState::Dragging;
            self.grace_deadline = None;
            self.decimal_x = 0.0;
            self.decimal_y = 0.0;
            self.averaging_x = 0.0;
            self.averaging_y = 0.0;
            self.averaging_count = 0;
            return None;
        }

        if !self.is_dragging && contacts.len() >= 3 {
            self.state = DragState::Armed;
        }

        if fingers_count >= 3
            && are_contacts_ids_commons
            && long_delay_moving == 3
            && original_fingers == 3
            && !self.is_dragging
        {
            // Start dragging: send mouse down
            self.is_dragging = true;
            self.state = DragState::Dragging;
            self.grace_deadline = None;
            self.decimal_x = 0.0;
            self.decimal_y = 0.0;
            self.averaging_x = 0.0;
            self.averaging_y = 0.0;
            self.averaging_count = 0;
            inject::send_mouse_left_button(true);
            Some(DragEvent::Started)
        } else if self.is_dragging
            && (short_delay_moving < 2 || (original_fingers != 3 && original_fingers >= 2))
        {
            // Stop dragging: finger count dropped below 2 or changed to 4+ (native gestures)
            self.stop_drag("fingers_dropped_or_changed")
        } else if fingers_count >= 2 && original_fingers == 3 && are_contacts_ids_commons && self.is_dragging {
            // Actively dragging: move cursor
            let mut event = None;
            if self.config.cursor_move {
                if self.config.max_finger_distance > 0 && longest_dist_2d > self.config.max_finger_distance as f32 {
                    // Discard single-frame glitch jump
                } else if longest_dx != 0 || longest_dy != 0 {
                    let (delta_x, delta_y) = DistanceManager::apply_speed_and_acc(
                        longest_dx as f32,
                        longest_dy as f32,
                        elapsed.as_millis() as u64,
                        self.config.speed,
                        self.config.acceleration,
                    );

                    let (step_x, step_y) = if self.config.cursor_averaging > 1 {
                        self.averaging_x += delta_x;
                        self.averaging_y += delta_y;
                        self.averaging_count += 1;
                        if self.averaging_count >= self.config.cursor_averaging {
                            let avg_x = self.averaging_x;
                            let avg_y = self.averaging_y;
                            self.averaging_x = 0.0;
                            self.averaging_y = 0.0;
                            self.averaging_count = 0;
                            self.shift_cursor(avg_x, avg_y)
                        } else {
                            (0, 0)
                        }
                    } else {
                        self.shift_cursor(delta_x, delta_y)
                    };

                    if step_x != 0 || step_y != 0 {
                        inject::send_mouse_relative_move(step_x, step_y);
                        event = Some(DragEvent::Moved { dx: step_x, dy: step_y });
                    }
                }
            }

            // Arm / refresh release delay
            if self.config.allow_release_and_restart && self.config.release_delay_ms > 0 {
                self.grace_deadline = Some(at + Duration::from_millis(self.config.release_delay_ms as u64));
            }

            event
        } else {
            if !self.is_dragging && fingers_count >= 3 {
                self.state = DragState::Armed;
            }
            None
        }
    }

    /// Subpixel accumulator for mouse movement.
    fn shift_cursor(&mut self, x: f32, y: f32) -> (i32, i32) {
        let int_x = (x + self.decimal_x) as i32;
        let int_y = (y + self.decimal_y) as i32;
        self.decimal_x = x + self.decimal_x - int_x as f32;
        self.decimal_y = y + self.decimal_y - int_y as f32;
        (int_x, int_y)
    }

    /// Timer tick: check for grace period expiration.
    pub fn on_timer(&mut self, at: Duration) -> Option<DragEvent> {
        if self.is_dragging || self.state == DragState::GracePeriod {
            if let Some(deadline) = self.grace_deadline {
                if at >= deadline {
                    return self.stop_drag("grace_period_expired");
                }
            }
        }
        None
    }

    pub fn next_deadline(&self) -> Option<Duration> {
        if self.is_dragging || self.state == DragState::GracePeriod {
            self.grace_deadline
        } else {
            None
        }
    }

    /// Cancel current drag immediately and release any synthetically held buttons.
    pub fn cancel(&mut self) {
        self.stop_drag("cancelled");
    }

    fn stop_drag(&mut self, reason: &'static str) -> Option<DragEvent> {
        let was_held = self.is_dragging;
        self.reset();
        if was_held {
            inject::send_mouse_left_button(false);
            Some(DragEvent::Stopped { reason })
        } else {
            None
        }
    }

    fn reset(&mut self) {
        self.state = DragState::Idle;
        self.is_dragging = false;
        self.prev_contacts.clear();
        self.grace_deadline = None;
        self.distance_manager.reset();
        self.finger_counter.reset();
        self.decimal_x = 0.0;
        self.decimal_y = 0.0;
        self.averaging_x = 0.0;
        self.averaging_y = 0.0;
        self.averaging_count = 0;
    }
}

/// Hardware capability detection result for Precision Touchpad.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TouchpadCapability {
    pub supported: bool,
    pub device_count: u32,
    pub device_name: Option<String>,
}

/// Query Windows for Precision Touchpad HID devices (UsagePage 0x0D, Usage 0x05).
pub fn detect_precision_touchpad() -> TouchpadCapability {
    unsafe {
        let mut count: u32 = 0;
        let list_size = size_of::<RAWINPUTDEVICELIST>() as u32;
        if GetRawInputDeviceList(std::ptr::null_mut(), &mut count, list_size) != 0 || count == 0 {
            return TouchpadCapability {
                supported: false,
                device_count: 0,
                device_name: None,
            };
        }

        let mut devices: Vec<RAWINPUTDEVICELIST> = vec![
            RAWINPUTDEVICELIST {
                hDevice: std::ptr::null_mut(),
                dwType: 0,
            };
            count as usize
        ];

        let got = GetRawInputDeviceList(devices.as_mut_ptr(), &mut count, list_size);
        if got == 0xFFFFFFFF || got == 0 {
            return TouchpadCapability {
                supported: false,
                device_count: 0,
                device_name: None,
            };
        }

        let mut ptp_count = 0u32;
        let mut ptp_name: Option<String> = None;

        for dev in devices.iter().filter(|d| d.dwType == RIM_TYPEHID) {
            let mut info_size = size_of::<RID_DEVICE_INFO>() as u32;
            let mut info: RID_DEVICE_INFO = std::mem::zeroed();
            info.cbSize = info_size;

            let res = GetRawInputDeviceInfoW(
                dev.hDevice,
                RIDI_DEVICEINFO,
                &mut info as *mut _ as *mut _,
                &mut info_size,
            );

            if res != 0xFFFFFFFF && res > 0 {
                let hid = info.Anonymous.hid;
                // Usage Page 0x0D (Digitizer), Usage 0x05 (Touch Pad)
                if hid.usUsagePage == 0x000D && hid.usUsage == 0x0005 {
                    ptp_count += 1;
                    if ptp_name.is_none() {
                        ptp_name = Some(format!(
                            "Precision Touchpad (VID: 0x{:04X}, PID: 0x{:04X})",
                            hid.dwVendorId, hid.dwProductId
                        ));
                    }
                }
            }
        }

        TouchpadCapability {
            supported: ptp_count > 0,
            device_count: ptp_count,
            device_name: ptp_name,
        }
    }
}

/// Register Precision Touchpad device for Raw Input notifications on `hwnd`.
pub fn register_precision_touchpad(hwnd: HWND) -> bool {
    if hwnd.is_null() {
        return false;
    }
    let dev = RAWINPUTDEVICE {
        usUsagePage: 0x000D, // HID_USAGE_PAGE_DIGITIZER
        usUsage: 0x0005,     // HID_USAGE_DIGITIZER_TOUCH_PAD
        dwFlags: RIDEV_INPUTSINK | 0x00002000, // RIDEV_INPUTSINK | RIDEV_DEVNOTIFY
        hwndTarget: hwnd,
    };
    let ok = unsafe { RegisterRawInputDevices(&dev, 1, size_of::<RAWINPUTDEVICE>() as u32) };
    ok != 0
}

#[derive(Clone)]
struct PtpDeviceCaps {
    is_ptp: bool,
    preparsed_data: Vec<u8>,
    value_caps: Vec<HIDP_VALUE_CAPS>,
}

static PTP_CACHE: Mutex<Option<HashMap<isize, PtpDeviceCaps>>> = Mutex::new(None);

fn get_or_query_device_caps(h_device: HANDLE) -> Option<PtpDeviceCaps> {
    if h_device.is_null() {
        return None;
    }
    unsafe {
        let mut info_size = size_of::<RID_DEVICE_INFO>() as u32;
        let mut info: RID_DEVICE_INFO = std::mem::zeroed();
        info.cbSize = info_size;
        let res = GetRawInputDeviceInfoW(
            h_device,
            RIDI_DEVICEINFO,
            &mut info as *mut _ as *mut _,
            &mut info_size,
        );
        if res == 0xFFFFFFFF || res == 0 {
            return None;
        }
        let hid = info.Anonymous.hid;
        if hid.usUsagePage != 0x000D || hid.usUsage != 0x0005 {
            return None;
        }

        let mut pp_size = 0u32;
        GetRawInputDeviceInfoW(h_device, RIDI_PREPARSEDDATA, std::ptr::null_mut(), &mut pp_size);
        if pp_size == 0 {
            return None;
        }
        let mut pp_data = vec![0u8; pp_size as usize];
        let got = GetRawInputDeviceInfoW(h_device, RIDI_PREPARSEDDATA, pp_data.as_mut_ptr() as _, &mut pp_size);
        if got == 0xFFFFFFFF || got == 0 {
            return None;
        }

        let mut caps: HIDP_CAPS = std::mem::zeroed();
        if HidP_GetCaps(pp_data.as_ptr() as _, &mut caps) != HIDP_STATUS_SUCCESS {
            return None;
        }

        let mut val_caps_len = caps.NumberInputValueCaps;
        let mut val_caps = vec![std::mem::zeroed::<HIDP_VALUE_CAPS>(); val_caps_len as usize];
        if HidP_GetValueCaps(HidP_Input, val_caps.as_mut_ptr(), &mut val_caps_len, pp_data.as_ptr() as _) != HIDP_STATUS_SUCCESS {
            return None;
        }
        val_caps.truncate(val_caps_len as usize);
        val_caps.sort_by_key(|vc| vc.LinkCollection);

        Some(PtpDeviceCaps {
            is_ptp: true,
            preparsed_data: pp_data,
            value_caps: val_caps,
        })
    }
}

fn parse_hid_report(
    caps: &PtpDeviceCaps,
    raw_hid_ptr: *const u8,
    raw_hid_len: usize,
    dw_size_hid: usize,
    dw_count: usize,
) -> (Vec<TouchpadContact>, u32) {
    let mut contact_count = 99u32;
    let mut contacts = Vec::new();

    #[derive(Default)]
    struct Creator {
        id: Option<i32>,
        x: Option<i32>,
        y: Option<i32>,
    }
    let mut creators: Vec<Creator> = Vec::new();

    for vc in &caps.value_caps {
        let usage = if vc.IsRange != 0 {
            unsafe { vc.Anonymous.Range.UsageMin }
        } else {
            unsafe { vc.Anonymous.NotRange.Usage }
        };

        for contact_index in 0..dw_count {
            let adjusted_ptr = (raw_hid_ptr as usize + dw_size_hid * contact_index) as *mut u8;
            let mut val = 0u32;
            let status = unsafe {
                HidP_GetUsageValue(
                    HidP_Input,
                    vc.UsagePage,
                    vc.LinkCollection,
                    usage,
                    &mut val,
                    caps.preparsed_data.as_ptr() as _,
                    adjusted_ptr,
                    raw_hid_len as u32,
                )
            };
            if status != HIDP_STATUS_SUCCESS {
                continue;
            }

            match vc.LinkCollection {
                0 => match (vc.UsagePage, usage) {
                    (0x0D, 0x54) => contact_count = val,
                    _ => {}
                },
                _ => {
                    while creators.len() <= contact_index {
                        creators.push(Creator::default());
                    }
                    match (vc.UsagePage, usage) {
                        (0x0D, 0x51) => creators[contact_index].id = Some(val as i32),
                        (0x01, 0x30) => creators[contact_index].x = Some(val as i32),
                        (0x01, 0x31) => creators[contact_index].y = Some(val as i32),
                        _ => {}
                    }
                }
            }
        }

        for cr in creators.iter_mut() {
            if (contact_count == 0 || contacts.len() < contact_count as usize)
                && cr.id.is_some()
                && cr.x.is_some()
                && cr.y.is_some()
            {
                contacts.push(TouchpadContact {
                    id: cr.id.unwrap(),
                    x: cr.x.unwrap(),
                    y: cr.y.unwrap(),
                });
                cr.id = None;
                cr.x = None;
                cr.y = None;
            }
        }

        if contact_count != 0 && contacts.len() >= contact_count as usize {
            break;
        }
    }

    (contacts, contact_count)
}

static CONTACTS_MGR: Mutex<ContactsManager> = Mutex::new(ContactsManager::new());
static LAST_RAW_REPORT_AT: Mutex<Duration> = Mutex::new(Duration::from_millis(0));

static TOUCHPAD_ENGINE: Mutex<Option<ThreeFingerDragEngine>> = Mutex::new(None);

fn with_engine<R>(f: impl FnOnce(&mut ThreeFingerDragEngine) -> R) -> R {
    let mut guard = TOUCHPAD_ENGINE.lock().unwrap_or_else(|p| p.into_inner());
    let engine = guard.get_or_insert_with(ThreeFingerDragEngine::new);
    f(engine)
}

pub fn on_raw_hid_report(
    h_device: HANDLE,
    raw_hid_ptr: *const u8,
    dw_size_hid: usize,
    dw_count: usize,
    total_len: usize,
    at: Duration,
) {
    if !TOUCHPAD_ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let mut cache = PTP_CACHE.lock().unwrap_or_else(|p| p.into_inner());
    let map = cache.get_or_insert_with(HashMap::new);
    let dev_key = h_device as isize;
    if !map.contains_key(&dev_key) {
        if let Some(caps) = get_or_query_device_caps(h_device) {
            map.insert(dev_key, caps);
        } else {
            return;
        }
    }
    let caps = match map.get(&dev_key) {
        Some(c) if c.is_ptp => c,
        _ => return,
    };

    let (contacts, count) = parse_hid_report(caps, raw_hid_ptr, total_len, dw_size_hid, dw_count);

    {
        let mut last_at = LAST_RAW_REPORT_AT.lock().unwrap_or_else(|p| p.into_inner());
        *last_at = at;
    }

    let mut reschedule = false;
    if count == 0 && contacts.is_empty() {
        // Finger lift reported directly by HID
        let mut mgr = CONTACTS_MGR.lock().unwrap_or_else(|p| p.into_inner());
        mgr.clear();
        with_engine(|engine| {
            let ev = engine.on_contacts(&[], at);
            if matches!(ev, Some(DragEvent::GracePeriodEntered)) {
                reschedule = true;
            }
        });
    } else {
        let frame = {
            let mut mgr = CONTACTS_MGR.lock().unwrap_or_else(|p| p.into_inner());
            mgr.receive_contacts(contacts, count)
        };
        if let Some(complete_contacts) = frame {
            with_engine(|engine| {
                let ev = engine.on_contacts(&complete_contacts, at);
                if matches!(ev, Some(DragEvent::GracePeriodEntered)) {
                    reschedule = true;
                }
            });
        }
    }

    if reschedule {
        crate::hook::reschedule_deadline();
    }
}

pub fn on_timer(at: Duration) {
    if !TOUCHPAD_ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let mut reschedule = false;
    {
        let last_at = *LAST_RAW_REPORT_AT.lock().unwrap_or_else(|p| p.into_inner());
        {
            let mut mgr = CONTACTS_MGR.lock().unwrap_or_else(|p| p.into_inner());
            mgr.check_timeout(at, last_at);
        }
        if last_at > Duration::from_millis(0) && at.saturating_sub(last_at) > Duration::from_millis(60) {
            with_engine(|engine| {
                if engine.is_dragging() || engine.state() == DragState::Armed {
                    let ev = engine.on_contacts(&[], at);
                    if matches!(ev, Some(DragEvent::GracePeriodEntered)) {
                        reschedule = true;
                    }
                }
            });
        }
    }
    with_engine(|engine| {
        let _ = engine.on_timer(at);
    });
    if reschedule {
        crate::hook::reschedule_deadline();
    }
}

pub fn next_deadline() -> Option<Duration> {
    if !TOUCHPAD_ENABLED.load(Ordering::Relaxed) {
        return None;
    }
    with_engine(|engine| {
        if engine.state() == DragState::GracePeriod {
            return engine.next_deadline();
        }
        if engine.is_dragging() || engine.state() == DragState::Armed {
            let last_at = *LAST_RAW_REPORT_AT.lock().unwrap_or_else(|p| p.into_inner());
            if last_at > Duration::from_millis(0) {
                return Some(last_at + Duration::from_millis(60));
            }
        }
        None
    })
}

pub fn cancel() {
    with_engine(|engine| engine.cancel());
}

pub fn set_config(cfg: TouchpadDragConfig) {
    TOUCHPAD_ENABLED.store(cfg.enabled, Ordering::SeqCst);
    with_engine(|engine| engine.set_config(cfg));
}

pub fn is_dragging() -> bool {
    with_engine(|engine| engine.is_dragging())
}

/// Fallback parser for synthetic test bytes.
pub fn parse_raw_ptp_report(bytes: &[u8]) -> Vec<TouchpadContact> {
    if bytes.len() < 7 {
        return Vec::new();
    }
    let count = (bytes[1] & 0x0F) as usize;
    if count == 0 || count > 5 {
        return Vec::new();
    }

    let mut contacts = Vec::with_capacity(count);
    let mut offset = 2;
    while offset + 5 <= bytes.len() && contacts.len() < count {
        let id = bytes[offset] as i32;
        let x = u16::from_le_bytes([bytes[offset + 1], bytes[offset + 2]]) as i32;
        let y = u16::from_le_bytes([bytes[offset + 3], bytes[offset + 4]]) as i32;
        contacts.push(TouchpadContact { id, x, y });
        offset += 5;
    }
    contacts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state_idle() {
        let engine = ThreeFingerDragEngine::new();
        assert_eq!(engine.state(), DragState::Idle);
        assert!(!engine.is_dragging());
    }

    #[test]
    fn test_contacts_manager_partial_burst_reassembly() {
        let mut mgr = ContactsManager::new();

        // Packet 1: incomplete burst (count = 3, but only 1 contact in packet)
        let p1 = vec![TouchpadContact { id: 1, x: 100, y: 100 }];
        let res1 = mgr.receive_contacts(p1, 3);
        assert!(res1.is_none());

        // Packet 2: continuation (count = 0, contact 2)
        let p2 = vec![TouchpadContact { id: 2, x: 200, y: 100 }];
        let res2 = mgr.receive_contacts(p2, 0);
        assert!(res2.is_none());

        // Packet 3: continuation (count = 0, contact 3 completes the burst)
        let p3 = vec![TouchpadContact { id: 3, x: 300, y: 100 }];
        let res3 = mgr.receive_contacts(p3, 0);
        assert!(res3.is_some());

        let frame = res3.unwrap();
        assert_eq!(frame.len(), 3);
        assert_eq!(frame[0].id, 1);
        assert_eq!(frame[1].id, 2);
        assert_eq!(frame[2].id, 3);
    }

    #[test]
    fn test_distance_manager_quarantine_rejects_bottom_right_landing_spike() {
        let mut dm = DistanceManager::new();

        let landing = [
            TouchpadContact { id: 1, x: 1000, y: 1000 },
            TouchpadContact { id: 2, x: 1100, y: 1000 },
            TouchpadContact { id: 3, x: 1200, y: 1000 },
        ];
        // At 100ms: first touch down
        let (_, _, _, dist0) = dm.get_longest_dist_2d(&[], &landing, true, Duration::from_millis(100));
        assert_eq!(dist0, 0.0);

        // At 110ms (10ms later): capacitive settling roll (+25px X, +35px Y to the bottom-right)
        let settling_roll = [
            TouchpadContact { id: 1, x: 1025, y: 1035 },
            TouchpadContact { id: 2, x: 1125, y: 1035 },
            TouchpadContact { id: 3, x: 1225, y: 1035 },
        ];
        let (_, dx, dy, dist1) = dm.get_longest_dist_2d(&landing, &settling_roll, false, Duration::from_millis(110));
        // Must be ZERO because contacts are quarantined for 40ms!
        assert_eq!(dist1, 0.0);
        assert_eq!(dx, 0);
        assert_eq!(dy, 0);

        // At 150ms (50ms after first touch down): quarantine has elapsed (> 40ms)
        let intentional_move = [
            TouchpadContact { id: 1, x: 1035, y: 1035 },
            TouchpadContact { id: 2, x: 1135, y: 1035 },
            TouchpadContact { id: 3, x: 1235, y: 1035 },
        ];
        let (_, dx2, _, dist2) = dm.get_longest_dist_2d(&settling_roll, &intentional_move, false, Duration::from_millis(150));
        // Intentional movement is now tracked!
        assert_eq!(dx2, 10);
        assert_eq!(dist2, 10.0);
    }

    #[test]
    fn test_finger_counter_start_threshold() {
        let mut fc = FingerCounter::new();
        let cfg = TouchpadDragConfig {
            speed: 60.0, // 60 / 60 = 1.0 factor for direct raw distance
            start_threshold: 50,
            stop_threshold: 10,
            ..TouchpadDragConfig::default()
        };

        let c = [
            TouchpadContact { id: 1, x: 100, y: 100 },
            TouchpadContact { id: 2, x: 200, y: 100 },
            TouchpadContact { id: 3, x: 300, y: 100 },
        ];

        // Small movement 20 raw units: below start_threshold (50)
        let (_, _, long1, _) = fc.count_moving_fingers(&c, true, 20.0, false, &cfg);
        assert_eq!(long1, 0); // Not started yet

        // Second move 35 raw units (total 55): exceeds start_threshold (50)
        let (_, _, long2, orig2) = fc.count_moving_fingers(&c, true, 35.0, false, &cfg);
        assert_eq!(long2, 3); // Started!
        assert_eq!(orig2, 3);
    }

    #[test]
    fn test_sigmoid_acceleration() {
        // Slow move: 2 units in 16ms -> mouse velocity = 2 / 16 = 0.125
        let (slow_dx, _) = DistanceManager::apply_speed_and_acc(2.0, 0.0, 16, 60.0, 10.0);
        // Fast move: 30 units in 16ms -> mouse velocity = 30 / 16 = 1.875
        let (fast_dx, _) = DistanceManager::apply_speed_and_acc(30.0, 0.0, 16, 60.0, 10.0);

        // Fast move should experience positive velocity scaling compared to slow move
        let slow_rate = slow_dx / 2.0;
        let fast_rate = fast_dx / 30.0;
        assert!(fast_rate > slow_rate, "Fast rate ({}) should exceed slow rate ({})", fast_rate, slow_rate);
    }

    #[test]
    fn test_release_delay_and_reposition() {
        let mut engine = ThreeFingerDragEngine::new();
        let mut cfg = TouchpadDragConfig::default();
        cfg.enabled = true;
        cfg.speed = 60.0;
        cfg.start_threshold = 10;
        cfg.release_delay_ms = 500;
        cfg.allow_release_and_restart = true;
        engine.set_config(cfg);

        // Land 3 fingers at 100ms
        let c1 = [
            TouchpadContact { id: 1, x: 100, y: 100 },
            TouchpadContact { id: 2, x: 120, y: 100 },
            TouchpadContact { id: 3, x: 140, y: 100 },
        ];
        engine.on_contacts(&c1, Duration::from_millis(100));
        engine.on_contacts(&c1, Duration::from_millis(125));

        // Pass quarantine at 150ms (50ms continuous elapsed)
        let c2 = [
            TouchpadContact { id: 1, x: 100, y: 100 },
            TouchpadContact { id: 2, x: 120, y: 100 },
            TouchpadContact { id: 3, x: 140, y: 100 },
        ];
        engine.on_contacts(&c2, Duration::from_millis(150));

        // Move 20 raw units at 160ms -> exceeds start_threshold (10) -> DRAG STARTS
        let c3 = [
            TouchpadContact { id: 1, x: 120, y: 100 },
            TouchpadContact { id: 2, x: 140, y: 100 },
            TouchpadContact { id: 3, x: 160, y: 100 },
        ];
        let ev = engine.on_contacts(&c3, Duration::from_millis(160));
        assert_eq!(ev, Some(DragEvent::Started));
        assert!(engine.is_dragging());

        // Lift fingers at 200ms -> Enters GracePeriod (500ms timer)
        let ev2 = engine.on_contacts(&[], Duration::from_millis(200));
        assert_eq!(ev2, Some(DragEvent::GracePeriodEntered));
        assert_eq!(engine.state(), DragState::GracePeriod);
        assert!(engine.is_dragging());

        // Reposition fingers on trackpad at 400ms (< 700ms deadline)
        let c4 = [
            TouchpadContact { id: 4, x: 3000, y: 500 },
            TouchpadContact { id: 5, x: 3020, y: 500 },
            TouchpadContact { id: 6, x: 3040, y: 500 },
        ];
        let ev3 = engine.on_contacts(&c4, Duration::from_millis(400));
        // Reposition landing produces NO jump and resumes Dragging!
        assert!(ev3.is_none());
        assert_eq!(engine.state(), DragState::Dragging);
        assert!(engine.is_dragging());
    }

    #[test]
    fn test_three_fingers_arm_and_move_to_drag() {
        let mut engine = ThreeFingerDragEngine::new();
        let mut cfg = TouchpadDragConfig::default();
        cfg.enabled = true;
        cfg.speed = 60.0;
        cfg.start_threshold = 10;
        engine.set_config(cfg);

        // 3 contacts land at 100ms
        let contacts1 = [
            TouchpadContact { id: 1, x: 100, y: 100 },
            TouchpadContact { id: 2, x: 120, y: 100 },
            TouchpadContact { id: 3, x: 140, y: 100 },
        ];
        let ev = engine.on_contacts(&contacts1, Duration::from_millis(100));
        assert!(ev.is_none());
        assert_eq!(engine.state(), DragState::Armed);

        // Contacts remain in quarantine at 120ms (20ms < 40ms)
        let contacts2 = [
            TouchpadContact { id: 1, x: 105, y: 100 },
            TouchpadContact { id: 2, x: 125, y: 100 },
            TouchpadContact { id: 3, x: 145, y: 100 },
        ];
        let ev = engine.on_contacts(&contacts2, Duration::from_millis(120));
        assert!(ev.is_none());
        assert_eq!(engine.state(), DragState::Armed);

        // Pass quarantine at 150ms (> 40ms)
        let contacts3 = [
            TouchpadContact { id: 1, x: 105, y: 100 },
            TouchpadContact { id: 2, x: 125, y: 100 },
            TouchpadContact { id: 3, x: 145, y: 100 },
        ];
        engine.on_contacts(&contacts3, Duration::from_millis(150));

        // Move 20 raw units at 160ms -> exceeds threshold (10) -> DRAG STARTS
        let contacts4 = [
            TouchpadContact { id: 1, x: 125, y: 100 },
            TouchpadContact { id: 2, x: 145, y: 100 },
            TouchpadContact { id: 3, x: 165, y: 100 },
        ];
        let ev = engine.on_contacts(&contacts4, Duration::from_millis(160));
        assert_eq!(ev, Some(DragEvent::Started));
        assert_eq!(engine.state(), DragState::Dragging);
        assert!(engine.is_dragging());
    }

    #[test]
    fn test_momentary_touch_does_not_click() {
        let mut engine = ThreeFingerDragEngine::new();
        let mut cfg = TouchpadDragConfig::default();
        cfg.enabled = true;
        cfg.start_threshold = 50;
        engine.set_config(cfg);

        // 3 contacts touch briefly
        let contacts = [
            TouchpadContact { id: 1, x: 100, y: 100 },
            TouchpadContact { id: 2, x: 120, y: 100 },
            TouchpadContact { id: 3, x: 140, y: 100 },
        ];
        engine.on_contacts(&contacts, Duration::from_millis(100));
        assert_eq!(engine.state(), DragState::Armed);

        // Fingers lift without moving past threshold
        let ev = engine.on_contacts(&[], Duration::from_millis(120));
        assert_eq!(ev, Some(DragEvent::Stopped { reason: "lift_before_threshold" }));
        assert_eq!(engine.state(), DragState::Idle);
        assert!(!engine.is_dragging());
    }

    #[test]
    fn test_cancel_releases_synthetic_button() {
        let mut engine = ThreeFingerDragEngine::new();
        let mut cfg = TouchpadDragConfig::default();
        cfg.enabled = true;
        cfg.speed = 60.0;
        cfg.start_threshold = 10;
        engine.set_config(cfg);

        let c1 = [
            TouchpadContact { id: 1, x: 100, y: 100 },
            TouchpadContact { id: 2, x: 120, y: 100 },
            TouchpadContact { id: 3, x: 140, y: 100 },
        ];
        engine.on_contacts(&c1, Duration::from_millis(100));
        engine.on_contacts(&c1, Duration::from_millis(125));
        engine.on_contacts(&c1, Duration::from_millis(150));

        let c2 = [
            TouchpadContact { id: 1, x: 130, y: 100 },
            TouchpadContact { id: 2, x: 150, y: 100 },
            TouchpadContact { id: 3, x: 170, y: 100 },
        ];
        engine.on_contacts(&c2, Duration::from_millis(160));
        assert_eq!(engine.state(), DragState::Dragging);

        engine.cancel();
        assert_eq!(engine.state(), DragState::Idle);
        assert!(!engine.is_dragging());
    }

    #[test]
    fn test_glitch_rejection_discards_large_jump() {
        let mut engine = ThreeFingerDragEngine::new();
        let mut cfg = TouchpadDragConfig::default();
        cfg.enabled = true;
        cfg.speed = 60.0;
        cfg.start_threshold = 10;
        cfg.max_finger_distance = 150;
        engine.set_config(cfg);

        // Start drag
        let c1 = [
            TouchpadContact { id: 1, x: 100, y: 100 },
            TouchpadContact { id: 2, x: 120, y: 100 },
            TouchpadContact { id: 3, x: 140, y: 100 },
        ];
        engine.on_contacts(&c1, Duration::from_millis(100));
        engine.on_contacts(&c1, Duration::from_millis(125));
        engine.on_contacts(&c1, Duration::from_millis(150));

        let c2 = [
            TouchpadContact { id: 1, x: 120, y: 100 },
            TouchpadContact { id: 2, x: 140, y: 100 },
            TouchpadContact { id: 3, x: 160, y: 100 },
        ];
        engine.on_contacts(&c2, Duration::from_millis(160));
        assert_eq!(engine.state(), DragState::Dragging);

        // Contact 3 suddenly glitches with a 500-unit jump (> 150 limit)
        let c3 = [
            TouchpadContact { id: 1, x: 123, y: 100 },
            TouchpadContact { id: 2, x: 143, y: 100 },
            TouchpadContact { id: 3, x: 660, y: 100 }, // GLITCH: +500 units
        ];
        let ev = engine.on_contacts(&c3, Duration::from_millis(170));
        // Glitch is rejected: no giant cursor jump!
        assert_ne!(ev, Some(DragEvent::Moved { dx: 250, dy: 0 }));
    }

    #[test]
    fn test_detect_precision_touchpad_live() {
        let cap = detect_precision_touchpad();
        println!("[test] detect_precision_touchpad: supported={}, count={}, name={:?}", cap.supported, cap.device_count, cap.device_name);
    }
}
