//! True hold-preserving key remap engine.
//!
//! The legacy path injected only the target DOWN on source DOWN and swallowed
//! the source UP — the target key was never released. This engine tracks held
//! remaps so a source DOWN injects the target DOWN (with the canonical extended
//! flag for the TARGET, not the source) and the source UP injects the target
//! UP. Auto-repeat downs never duplicate a held target, stray source ups never
//! inject, and release_all() on pause/reload/shutdown/bypass lets the helper
//! leave every injected key lifted. Injected events carry OWN_INJECTED_MARKER
//! (see inject::send_vk) so they never re-enter KeyFlow matching.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::config::KeyBehavior;
use crate::keymap::is_extended_vk;

/// One pending injection: (target vk, down, extended).
pub type Inject = (u32, bool, bool);

#[derive(Debug, Default)]
pub struct RemapEngine {
    /// source vk -> (target vk, extended) currently held (target DOWN injected).
    held: HashMap<u32, (u32, bool)>,
    /// Sources physically held whose injected target was released because the
    /// rule stopped applying (e.g. foreground switched away from the scoped
    /// app). Their physical UP must be swallowed so no half-injected key leaks;
    /// the next fresh press behaves normally.
    awaiting_up: HashSet<u32>,
    paused: bool,
}

impl RemapEngine {
    pub fn new() -> Self {
        RemapEngine {
            held: HashMap::new(),
            awaiting_up: HashSet::new(),
            paused: false,
        }
    }

    /// Process a physical source-key event for a remap. Returns the target
    /// injection to send, or None when nothing should be injected (auto-repeat
    /// down while already held, a stray up with no matching held down, or a
    /// source that was released by a scope change and is awaiting its physical
    /// UP).
    pub fn on_key(&mut self, down: bool, source_vk: u32, target_vk: u32) -> Option<Inject> {
        if self.paused {
            return None;
        }
        if self.awaiting_up.contains(&source_vk) {
            if !down {
                self.awaiting_up.remove(&source_vk);
            }
            return None; // swallow; the target was already released on scope change
        }
        let extended = is_extended_vk(target_vk);
        if down {
            if self.held.contains_key(&source_vk) {
                return None; // auto-repeat: target already down
            }
            self.held.insert(source_vk, (target_vk, extended));
            Some((target_vk, true, extended))
        } else if let Some(&(tvk, ext)) = self.held.get(&source_vk) {
            self.held.remove(&source_vk);
            Some((tvk, false, ext))
        } else {
            None // stray source UP after release_all/disable
        }
    }

    /// Release every held remap whose rule no longer applies for the current
    /// active app. `resolve` returns the behavior the source key should have
    /// RIGHT NOW (already scope-resolved). Held sources whose target changed
    /// (or is no longer a remap) get their target released and are marked
    /// awaiting their physical UP. Returns the UP injections to send.
    pub fn on_scope_change(&mut self, resolve: impl Fn(u32) -> KeyBehavior) -> Vec<Inject> {
        let mut out = Vec::new();
        let mut stale: Vec<u32> = Vec::new();
        for (&source, &(target, ext)) in self.held.iter() {
            let still_applies = match resolve(source) {
                KeyBehavior::Remap(to) => to == target,
                _ => false,
            };
            if !still_applies {
                out.push((target, false, ext));
                stale.push(source);
            }
        }
        for source in stale {
            self.held.remove(&source);
            self.awaiting_up.insert(source);
        }
        out
    }

    pub fn is_held(&self, source_vk: u32) -> bool {
        self.held.contains_key(&source_vk)
    }

    pub fn is_awaiting_up(&self, source_vk: u32) -> bool {
        self.awaiting_up.contains(&source_vk)
    }

    /// Hook-side swallow for a source released by a scope change (instance
    /// version, used by tests). See the `swallow_awaiting` free function.
    pub fn swallow_awaiting(&mut self, down: bool, source_vk: u32) -> bool {
        if !self.is_awaiting_up(source_vk) {
            return false;
        }
        if !down {
            self.awaiting_up.remove(&source_vk);
        }
        true
    }

    /// Release every currently-injected target key (pause, reload, shutdown,
    /// bypass). Returns the UP injections to send.
    pub fn release_all(&mut self) -> Vec<Inject> {
        let mut out = Vec::new();
        for (_, (tvk, ext)) in self.held.drain() {
            out.push((tvk, false, ext));
        }
        out
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
        if paused {
            let _ = self.release_all();
        }
    }

    pub fn held_count(&self) -> usize {
        self.held.len()
    }
}

/// Process-wide engine, shared with the hook thread and main.rs lifecycle
/// paths (pause / reload / shutdown / bypass).
static REMAP: std::sync::LazyLock<Mutex<RemapEngine>> = std::sync::LazyLock::new(|| Mutex::new(RemapEngine::new()));

pub fn handle_key(down: bool, source_vk: u32, target_vk: u32) -> Option<Inject> {
    REMAP.lock().unwrap_or_else(|p| p.into_inner()).on_key(down, source_vk, target_vk)
}

pub fn on_scope_change(resolve: impl Fn(u32) -> KeyBehavior) -> Vec<Inject> {
    REMAP.lock().unwrap_or_else(|p| p.into_inner()).on_scope_change(resolve)
}

pub fn is_awaiting_up(source_vk: u32) -> bool {
    REMAP.lock().unwrap_or_else(|p| p.into_inner()).is_awaiting_up(source_vk)
}

/// Hook-side swallow for a source released by a scope change. While the
/// source awaits its physical UP, both a re-press DOWN and the UP itself are
/// swallowed; the UP clears the awaiting state so the next fresh press is
/// evaluated normally.
pub fn swallow_awaiting(down: bool, source_vk: u32) -> bool {
    REMAP.lock()
        .unwrap_or_else(|p| p.into_inner())
        .swallow_awaiting(down, source_vk)
}

pub fn release_all() -> Vec<Inject> {
    REMAP.lock().unwrap_or_else(|p| p.into_inner()).release_all()
}

pub fn set_paused(paused: bool) {
    REMAP.lock().unwrap_or_else(|p| p.into_inner()).set_paused(paused);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> RemapEngine {
        RemapEngine::new()
    }

    #[test]
    fn remap_down_injects_target_down() {
        let mut e = engine();
        assert_eq!(e.on_key(true, 0x33, 0x09), Some((0x09, true, false))); // '3' -> Tab
        assert!(e.is_held(0x33));
        assert_eq!(e.held_count(), 1);
    }

    #[test]
    fn remap_up_injects_target_up() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        assert_eq!(e.on_key(false, 0x33, 0x09), Some((0x09, false, false)));
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn remap_repeat_does_not_duplicate_down() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        // Auto-repeat downs while held must not inject another target down.
        for _ in 0..30 {
            assert_eq!(e.on_key(true, 0x33, 0x09), None);
        }
        assert_eq!(e.held_count(), 1, "repeat must not stack state");
        assert_eq!(e.on_key(false, 0x33, 0x09), Some((0x09, false, false)));
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn remap_stray_up_injects_nothing() {
        let mut e = engine();
        assert_eq!(e.on_key(false, 0x33, 0x09), None, "up with no held down is ignored");
    }

    #[test]
    fn remap_extended_flag_comes_from_target() {
        let mut e = engine();
        // Arrows are extended keys; the TARGET flag must be used, not the source.
        assert_eq!(e.on_key(true, 0x33, 0x26), Some((0x26, true, true))); // '3' -> Up
        assert_eq!(e.on_key(false, 0x33, 0x26), Some((0x26, false, true)));
        // Tab is not extended.
        assert_eq!(e.on_key(true, 0x31, 0x09), Some((0x09, true, false))); // '1' -> Tab
    }

    #[test]
    fn remap_arrow_target_is_extended() {
        let mut e = engine();
        for (target, ext) in [(0x25, true), (0x26, true), (0x27, true), (0x28, true)] {
            assert_eq!(e.on_key(true, 0x57, target), Some((target, true, ext)));
            assert_eq!(e.on_key(false, 0x57, target), Some((target, false, ext)));
        }
    }

    #[test]
    fn remap_modifier_target_not_extended() {
        let mut e = engine();
        // Caps Lock -> Ctrl: VK_CONTROL (0x11) is not an extended key.
        assert_eq!(e.on_key(true, 0x14, 0x11), Some((0x11, true, false)));
        assert_eq!(e.on_key(false, 0x14, 0x11), Some((0x11, false, false)));
    }

    #[test]
    fn remap_release_all_sends_up_for_held() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09); // '3' -> Tab
        e.on_key(true, 0x57, 0x26); // W -> Up
        let released = e.release_all();
        assert_eq!(released.len(), 2);
        assert!(released.contains(&(0x09, false, false)));
        assert!(released.contains(&(0x26, false, true)));
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn remap_release_all_clears_state() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        e.release_all();
        // A physical source UP after release must not inject a stray target up.
        assert_eq!(e.on_key(false, 0x33, 0x09), None);
    }

    #[test]
    fn remap_reload_while_held_releases() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        let released = e.release_all(); // Configure/reload path
        assert_eq!(released, vec![(0x09, false, false)]);
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn remap_pause_releases_held() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        e.set_paused(true);
        assert_eq!(e.held_count(), 0, "pause must release injected targets");
        // While paused, no new remap input is produced.
        assert_eq!(e.on_key(true, 0x33, 0x09), None);
    }

    #[test]
    fn remap_resume_keeps_clean() {
        let mut e = engine();
        e.set_paused(true);
        e.set_paused(false);
        assert_eq!(e.on_key(true, 0x33, 0x09), Some((0x09, true, false)));
        assert_eq!(e.on_key(false, 0x33, 0x09), Some((0x09, false, false)));
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn remap_disable_while_source_held_no_duplicate_up() {
        let mut e = engine();
        // Physical source down -> remap held.
        e.on_key(true, 0x33, 0x09);
        // Feature disabled mid-hold -> target released.
        let released = e.release_all();
        assert_eq!(released, vec![(0x09, false, false)]);
        // Physical source up arrives later -> NO extra target up.
        assert_eq!(e.on_key(false, 0x33, 0x09), None);
    }

    #[test]
    fn remap_independent_keys() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        e.on_key(true, 0x57, 0x26);
        // Releasing one source only lifts that target.
        assert_eq!(e.on_key(false, 0x33, 0x09), Some((0x09, false, false)));
        assert!(e.is_held(0x57), "unrelated remap must stay held");
        assert_eq!(e.on_key(false, 0x57, 0x26), Some((0x26, false, true)));
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn remap_100_cycles_no_leak() {
        let mut e = engine();
        for cycle in 0..100 {
            assert_eq!(e.on_key(true, 0x33, 0x09), Some((0x09, true, false)), "cycle {cycle}");
            assert_eq!(e.on_key(false, 0x33, 0x09), Some((0x09, false, false)), "cycle {cycle}");
            assert_eq!(e.held_count(), 0, "cycle {cycle} stuck");
        }
    }

    #[test]
    fn remap_mixed_200_cycles() {
        let mut e = engine();
        let map = [(0x33, 0x09, false), (0x57, 0x26, true), (0x46, 0x28, true)];
        for cycle in 0..200 {
            let (src, tgt, ext) = map[cycle % map.len()];
            assert_eq!(e.on_key(true, src, tgt), Some((tgt, true, ext)));
            assert_eq!(e.on_key(false, src, tgt), Some((tgt, false, ext)));
            assert_eq!(e.held_count(), 0, "cycle {cycle} stuck");
        }
    }

    #[test]
    fn remap_shutdown_releases() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        e.on_key(true, 0x57, 0x26);
        let released = e.release_all(); // Shutdown path
        assert_eq!(released.len(), 2);
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn remap_bypass_releases() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        let released = e.release_all(); // Emergency bypass latch path
        assert_eq!(released, vec![(0x09, false, false)]);
    }

    // ── App-Specific (Scoped) Remaps ─────────────────────────────────────────

    #[test]
    fn foreground_change_releases_remapped_target() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09); // 3 -> Tab held in Photoshop
        assert!(e.is_held(0x33));
        // Foreground leaves Photoshop: rule stops applying -> target released.
        let released = e.on_scope_change(|_vk| KeyBehavior::Pass);
        assert_eq!(released, vec![(0x09, false, false)]);
        assert!(!e.is_held(0x33), "stale source must be dropped");
        assert!(e.is_awaiting_up(0x33), "source must await its physical UP");
        // The physical source UP arrives -> swallowed, nothing injected.
        assert_eq!(e.on_key(false, 0x33, 0x09), None);
        assert!(!e.is_awaiting_up(0x33), "awaiting state must clear after UP");
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn foreground_change_to_other_scope_retargets_held_key() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09); // held as Tab in Photoshop
        // Foreground switches to another app whose rule maps 3 -> Enter.
        let released = e.on_scope_change(|_vk| KeyBehavior::Remap(0x0d));
        // Old target Tab released; the source is marked awaiting UP, so the
        // physical UP is swallowed and nothing else is injected.
        assert_eq!(released, vec![(0x09, false, false)]);
        assert!(e.is_awaiting_up(0x33));
        assert_eq!(e.on_key(false, 0x33, 0x09), None);
        assert!(!e.is_awaiting_up(0x33));
        // The scope change never retargets the held key mid-hold.
        assert!(e.held.is_empty(), "no target may stay injected after scope change");
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn swallow_awaiting_consumes_repress_then_clears_on_up() {
        let mut e = engine();
        e.on_key(true, 0x33, 0x09);
        e.on_scope_change(|_vk| KeyBehavior::Pass); // marks awaiting_up
        assert!(e.is_awaiting_up(0x33));
        // Hook-layer swallow: a repeat DOWN is consumed (no injection).
        assert!(e.swallow_awaiting(true, 0x33), "DOWN while awaiting must be swallowed");
        // Physical UP clears the awaiting state and is also swallowed.
        assert!(e.swallow_awaiting(false, 0x33), "UP clears awaiting and is swallowed");
        assert!(!e.is_awaiting_up(0x33));
        // After UP, a genuinely new press is a normal engine event again.
        assert_eq!(e.on_key(true, 0x33, 0x09), Some((0x09, true, false)));
        assert_eq!(e.on_key(false, 0x33, 0x09), Some((0x09, false, false)));
    }

    #[test]
    fn foreground_change_keeps_global_remap_held() {
        let mut e = engine();
        e.on_key(true, 0x57, 0x26); // global W -> Up stays valid
        let released = e.on_scope_change(|_vk| KeyBehavior::Remap(0x26));
        assert!(released.is_empty(), "still-matching remap must not be released");
        assert!(e.is_held(0x57));
        assert!(!e.is_awaiting_up(0x57));
        assert_eq!(e.on_key(false, 0x57, 0x26), Some((0x26, false, true)));
        assert_eq!(e.held_count(), 0);
    }

    #[test]
    fn scope_change_with_no_held_remaps_is_noop() {
        let mut e = engine();
        let released = e.on_scope_change(|_vk| KeyBehavior::Pass);
        assert!(released.is_empty());
        assert_eq!(e.held_count(), 0);
        assert!(!e.is_awaiting_up(0x33));
    }
}