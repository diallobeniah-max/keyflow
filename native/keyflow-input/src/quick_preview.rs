//! Fast, fail-open gate for Quick Preview. Explorer/COM inspection runs outside
//! the keyboard hook; this module only accepts a recent, revision-matched result.
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::Duration;
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetGUIThreadInfo, GUITHREADINFO, GUI_CARETBLINKING};

const MAX_AGE: Duration = Duration::from_millis(500);

#[derive(Clone, Copy, Default)]
struct Snapshot { foreground: usize, focus: usize, revision: u64, at: Duration }

#[derive(Default)]
struct State {
    enabled: bool,
    key: u32,
    modifiers: u32,
    revision: u64,
    snapshot: Option<Snapshot>,
    owned_key: u32,
    preview_window: usize,
    preview_escape: bool,
}

impl State {
    fn invalidate(&mut self) -> u64 {
        self.revision = self.revision.wrapping_add(1);
        self.snapshot = None;
        self.revision
    }

    fn update(&mut self, revision: u64, foreground: usize, focus: usize, valid: bool, now: Duration) {
        if !self.enabled || revision != self.revision { return; }
        self.snapshot = if valid && foreground != 0 && focus != 0 { Some(Snapshot { foreground, focus, revision, at: now }) } else { None };
    }

    fn key(&mut self, down: bool, vk: u32, mods: u32, foreground: usize, focus: usize, typing: bool, allow: bool, now: Duration) -> (bool, bool) {
        if self.owned_key == vk {
            if !down { self.owned_key = 0; }
            return (true, false);
        }
        if !down || !allow || !self.enabled || vk != self.key || mods != self.modifiers || typing { return (false, false); }
        let Some(s) = self.snapshot else { return (false, false) };
        if s.revision != self.revision || s.foreground != foreground || s.focus != focus || now.saturating_sub(s.at) > MAX_AGE { return (false, false); }
        self.owned_key = vk;
        self.snapshot = None;
        (true, true)
    }

    fn preview_key(&mut self, down: bool, vk: u32, mods: u32, foreground: usize, typing: bool, allow: bool) -> (bool, bool) {
        if self.owned_key == vk {
            if !down { self.owned_key = 0; }
            return (true, false);
        }
        if !down || !allow || !self.enabled || self.preview_window == 0 || foreground != self.preview_window { return (false, false); }
        let shortcut = !typing && vk == self.key && mods == self.modifiers;
        let escape = self.preview_escape && vk == 0x1b && mods == 0;
        if !shortcut && !escape { return (false, false); }
        self.owned_key = vk;
        (true, true)
    }
}

static STATE: Mutex<State> = Mutex::new(State { enabled: false, key: 0, modifiers: 0, revision: 0, snapshot: None, owned_key: 0, preview_window: 0, preview_escape: false });
static OWNED_KEY: AtomicU32 = AtomicU32::new(0);
static ENABLED: AtomicBool = AtomicBool::new(false);
static REVISION: AtomicU64 = AtomicU64::new(0);

fn publish_revision(revision: u64) {
    crate::hook::queue(crate::protocol::OutMessage::QuickPreviewRevision { version: crate::protocol::PROTOCOL_VERSION, revision, available: crate::raw_mouse::selection_invalidation_available() }.to_json());
}

pub fn configure(enabled: bool, key: u32, modifiers: u32) {
    ENABLED.store(false, Ordering::SeqCst);
    let revision = REVISION.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    {
        let mut state = STATE.lock().unwrap_or_else(|p| p.into_inner());
        state.enabled = enabled && key != 0;
        state.key = key;
        state.modifiers = modifiers;
        state.revision = revision;
        state.snapshot = None;
        if !enabled { state.preview_window = 0; state.preview_escape = false; }
    }
    ENABLED.store(enabled && key != 0, Ordering::SeqCst);
    publish_revision(revision);
}

pub fn set_preview_window(hwnd: usize, escape: bool) {
    let mut state = STATE.lock().unwrap_or_else(|p| p.into_inner());
    state.preview_window = if state.enabled { hwnd } else { 0 };
    state.preview_escape = state.preview_window != 0 && escape;
}

pub fn invalidate() {
    if ENABLED.load(Ordering::SeqCst) {
        let revision = REVISION.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
        publish_revision(revision);
    }
}

pub fn publish_current_revision() {
    publish_revision(REVISION.load(Ordering::SeqCst));
}

pub fn update(revision: u64, foreground: usize, focus: usize, valid: bool) {
    if revision != REVISION.load(Ordering::SeqCst) { return; }
    if let Ok(mut state) = STATE.try_lock() {
        if revision != REVISION.load(Ordering::SeqCst) { return; }
        state.revision = revision;
        state.update(revision, foreground, focus, valid, crate::hook::now_at());
    }
}

/// Returns whether the event is owned. A fresh trigger is emitted only once.
pub fn key_event(down: bool, vk: u32, modifiers: u32, allow: bool, allow_preview: bool) -> bool {
    if OWNED_KEY.load(Ordering::SeqCst) == vk {
        if !down { OWNED_KEY.store(0, Ordering::SeqCst); }
        return true;
    }
    let mut info: GUITHREADINFO = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<GUITHREADINFO>() as u32;
    let ok = unsafe { GetGUIThreadInfo(0, &mut info) } != 0;
    let foreground = unsafe { GetForegroundWindow() } as usize;
    let focus = if ok { info.hwndFocus as usize } else { 0 };
    let typing = !ok || (info.flags & GUI_CARETBLINKING) != 0;
    let (owned, fired) = if let Ok(mut state) = STATE.try_lock() {
        if state.snapshot.map_or(false, |s| s.revision != REVISION.load(Ordering::SeqCst)) { state.snapshot = None; }
        let preview_result = state.preview_key(down, vk, modifiers, foreground, typing, allow_preview);
        let mut result = if preview_result.0 { preview_result } else { state.key(down, vk, modifiers, foreground, focus, typing, allow, crate::hook::now_at()) };
        if result.1 && !preview_result.0 && state.revision != REVISION.load(Ordering::SeqCst) { state.owned_key = 0; result = (false, false); }
        if result.1 { state.owned_key = 0; OWNED_KEY.store(vk, Ordering::SeqCst); }
        result
    } else { (false, false) };
    if fired { crate::hook::queue(crate::protocol::OutMessage::QuickPreviewTriggered { version: crate::protocol::PROTOCOL_VERSION }.to_json()); }
    owned
}

pub fn is_candidate(vk: u32) -> bool { OWNED_KEY.load(Ordering::SeqCst) == vk || STATE.try_lock().map(|state| state.enabled && (state.key == vk || (state.preview_window != 0 && state.preview_escape && vk == 0x1b))).unwrap_or(false) }

#[cfg(test)]
mod tests {
    use super::*;
    fn ms(n: u64) -> Duration { Duration::from_millis(n) }
    #[test]
    fn accepts_only_fresh_matching_snapshot_and_pairs_up() {
        let mut s = State { enabled: true, key: 32, ..State::default() };
        s.update(0, 10, 20, true, ms(10));
        assert_eq!(s.key(true, 32, 0, 10, 21, false, true, ms(20)), (false, false));
        assert_eq!(s.key(true, 32, 0, 10, 20, true, true, ms(20)), (false, false));
        assert_eq!(s.key(true, 32, 1, 10, 20, false, true, ms(20)), (false, false));
        assert_eq!(s.key(true, 32, 0, 10, 20, false, false, ms(20)), (false, false));
        assert_eq!(s.key(true, 32, 0, 10, 20, false, true, ms(511)), (false, false));
        assert_eq!(s.key(true, 32, 0, 10, 20, false, true, ms(20)), (true, true));
        assert_eq!(s.key(true, 32, 0, 10, 20, false, true, ms(21)), (true, false));
        assert_eq!(s.key(false, 32, 0, 99, 99, false, false, ms(22)), (true, false));
        assert_eq!(s.key(false, 32, 0, 99, 99, false, true, ms(23)), (false, false));
    }
    #[test]
    fn invalidation_rejects_delayed_worker_result() {
        let mut s = State { enabled: true, key: 32, ..State::default() };
        let old = s.revision; s.invalidate(); s.update(old, 10, 20, true, ms(10));
        assert_eq!(s.key(true, 32, 0, 10, 20, false, true, ms(20)), (false, false));
        s.update(s.revision, 10, 20, true, ms(21));
        assert_eq!(s.key(true, 32, 0, 10, 20, false, true, ms(22)), (true, true));
    }
    #[test]
    fn preview_keys_are_limited_to_registered_foreground_and_pair_releases() {
        let mut s = State { enabled: true, key: 32, preview_window: 55, preview_escape: true, ..State::default() };
        assert_eq!(s.preview_key(true, 32, 0, 56, false, true), (false, false));
        assert_eq!(s.preview_key(true, 32, 1, 55, false, true), (false, false));
        assert_eq!(s.preview_key(true, 32, 0, 55, true, true), (false, false));
        assert_eq!(s.preview_key(true, 32, 0, 55, false, false), (false, false));
        assert_eq!(s.preview_key(true, 0x1b, 2, 55, false, true), (false, false));
        assert_eq!(s.preview_key(true, 32, 0, 55, false, true), (true, true));
        assert_eq!(s.preview_key(false, 32, 0, 56, false, false), (true, false));
        assert_eq!(s.preview_key(true, 0x1b, 0, 55, true, true), (true, true));
        assert_eq!(s.preview_key(false, 0x1b, 0, 55, true, true), (true, false));
        s.preview_escape = false;
        assert_eq!(s.preview_key(true, 0x1b, 0, 55, false, true), (false, false));
    }
    #[test]
    fn custom_preview_binding_requires_exact_key_and_modifiers() {
        let mut s = State { enabled: true, key: 0x70, modifiers: 0b0011, preview_window: 55, preview_escape: false, ..State::default() };
        assert_eq!(s.preview_key(true, 0x70, 0b0001, 55, false, true), (false, false));
        assert_eq!(s.preview_key(true, 0x70, 0b0111, 55, false, true), (false, false));
        assert_eq!(s.preview_key(true, 0x71, 0b0011, 55, false, true), (false, false));
        assert_eq!(s.preview_key(true, 0x70, 0b0011, 55, true, true), (false, false));
        assert_eq!(s.preview_key(true, 0x70, 0b0011, 55, false, true), (true, true));
        assert_eq!(s.preview_key(false, 0x70, 0, 55, false, true), (true, false));
    }
}
