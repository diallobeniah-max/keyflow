//! VK lookup helpers: modifier tracking bits for the emergency bypass chord.

/// Modifier mask bit for a VK, or 0 for non-modifiers.
/// bit0 = Ctrl, bit1 = Alt, bit2 = Shift, bit3 = Win.
pub fn modifier_bit(vk: u32) -> u32 {
    match vk {
        0x11 | 0xA2 | 0xA3 => 0b0001, // Ctrl / L / R
        0x12 | 0xA4 | 0xA5 => 0b0010, // Alt / L / R
        0x10 | 0xA0 | 0xA1 => 0b0100, // Shift / L / R
        0x5B | 0x5C => 0b1000,        // Win / L / R
        _ => 0,
    }
}

pub const F12_VK: u32 = 0x7B;
pub const EMERGENCY_BYPASS_MASK: u32 = 0b0111; // Ctrl+Alt+Shift all down (Win excluded)

/// Human-readable modifier mask for diagnostics, e.g. "ctrl,alt,win".
pub fn mods_display(m: u32) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if m & 0b0001 != 0 {
        parts.push("ctrl");
    }
    if m & 0b0010 != 0 {
        parts.push("alt");
    }
    if m & 0b0100 != 0 {
        parts.push("shift");
    }
    if m & 0b1000 != 0 {
        parts.push("win");
    }
    parts.join(",")
}

pub fn is_f12(vk: u32) -> bool {
    vk == F12_VK
}

/// Canonical extended-key classification for remap target injection. Extended
/// keys need KEYEVENTF_EXTENDEDKEY so Windows resolves them to the right
/// physical key (arrows, PageUp/Down, Home/End, Insert/Delete, Right Ctrl/Alt,
/// Numpad Enter, Numpad Divide). Kept in sync with electron/win-vk.ts
/// `isExtendedVk`.
pub fn is_extended_vk(vk: u32) -> bool {
    match vk {
        0x21..=0x28 => true, // PageUp, PageDown, End, Home, Left, Up, Right, Down
        0x2D | 0x2E => true, // Insert, Delete
        0x36 => true,        // Numpad Divide
        0x6D => true,        // Numpad Subtract
        0x90 => true,        // NumLock
        0x93 => true,        // Select Media
        0xA3 | 0xA5 => true, // Right Ctrl, Right Alt
        _ => false,
    }
}

/// Returns true if this virtual key code represents a standard printable or
/// typing key (letters, numbers, space, punctuation, enter, backspace).
/// Non-printable dedicated control keys like CapsLock, Escape, F-keys, and
/// navigation arrows return false and are never throttled by typing protection.
pub fn is_printable_vk(vk: u32) -> bool {
    match vk {
        // Letters A-Z
        0x41..=0x5A => true,
        // Numbers 0-9
        0x30..=0x39 => true,
        // Numpad 0-9, Multiply, Add, Separator, Subtract, Decimal, Divide
        0x60..=0x6F => true,
        // OEM Punctuation (;:, =+, ,<, -_, .>, /?, `~)
        0xBA..=0xC0 => true,
        // OEM Brackets, Slash, Quote ([{, \|, ]}, '")
        0xDB..=0xDE => true,
        // Space, Enter, Backspace (standard typing stream keys)
        0x20 | 0x0D | 0x08 => true,
        // Dedicated special/function keys (CapsLock, Escape, F-keys, arrows, etc.) are NOT printable
        _ => false,
    }
}

/// Human-readable name for capture results (best-effort; fallback hex).
pub fn vk_name(vk: u32) -> &'static str {
    match vk {
        0x08 => "Backspace",
        0x09 => "Tab",
        0x0D => "Enter",
        0x10 => "Shift",
        0x11 => "Ctrl",
        0x12 => "Alt",
        0x14 => "CapsLock",
        0x1B => "Escape",
        0x20 => "Space",
        0x21 => "PageUp",
        0x22 => "PageDown",
        0x23 => "End",
        0x24 => "Home",
        0x25 => "Left",
        0x26 => "Up",
        0x27 => "Right",
        0x28 => "Down",
        0x2D => "Insert",
        0x2E => "Delete",
        0x5B => "Win",
        0x5C => "Win",
        0x70..=0x7B => {
            const NAMES: [&str; 12] = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];
            NAMES[(vk - 0x70) as usize]
        }
        0x41 => "A",
        0x42 => "B",
        0x43 => "C",
        0x44 => "D",
        0x45 => "E",
        0x46 => "F",
        0x47 => "G",
        0x48 => "H",
        0x49 => "I",
        0x4A => "J",
        0x4B => "K",
        0x4C => "L",
        0x4D => "M",
        0x4E => "N",
        0x4F => "O",
        0x50 => "P",
        0x51 => "Q",
        0x52 => "R",
        0x53 => "S",
        0x54 => "T",
        0x55 => "U",
        0x56 => "V",
        0x57 => "W",
        0x58 => "X",
        0x59 => "Y",
        0x5A => "Z",
        _ => "Key",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modifier_bits() {
        assert_eq!(modifier_bit(0x11), 0b001);
        assert_eq!(modifier_bit(0xA2), 0b001);
        assert_eq!(modifier_bit(0xA3), 0b001);
        assert_eq!(modifier_bit(0x12), 0b010);
        assert_eq!(modifier_bit(0xA4), 0b010);
        assert_eq!(modifier_bit(0xA5), 0b010);
        assert_eq!(modifier_bit(0x10), 0b100);
        assert_eq!(modifier_bit(0xA0), 0b100);
        assert_eq!(modifier_bit(0xA1), 0b100);
        assert_eq!(modifier_bit(0x5B), 0b1000);
        assert_eq!(modifier_bit(0x5C), 0b1000);
        assert_eq!(modifier_bit(0x41), 0);
        assert_eq!(modifier_bit(F12_VK), 0);
    }

    #[test]
    fn f12_detection() {
        assert!(is_f12(0x7B));
        assert!(!is_f12(0x7A));
    }

    #[test]
    fn printable_keys_classification() {
        // Letters and digits are printable
        assert!(is_printable_vk(0x46)); // 'F'
        assert!(is_printable_vk(0x41)); // 'A'
        assert!(is_printable_vk(0x31)); // '1'
        assert!(is_printable_vk(0x20)); // Space

        // CapsLock, Escape, F-keys are NOT printable
        assert!(!is_printable_vk(0x14)); // CapsLock
        assert!(!is_printable_vk(0x1B)); // Escape
        assert!(!is_printable_vk(0x70)); // F1
        assert!(!is_printable_vk(0x25)); // Left arrow
    }

    #[test]
    fn extended_vk_classification() {
        // Arrows and nav cluster are extended keys.
        assert!(is_extended_vk(0x25)); // Left
        assert!(is_extended_vk(0x26)); // Up
        assert!(is_extended_vk(0x27)); // Right
        assert!(is_extended_vk(0x28)); // Down
        assert!(is_extended_vk(0x21)); // PageUp
        assert!(is_extended_vk(0x22)); // PageDown
        assert!(is_extended_vk(0x23)); // End
        assert!(is_extended_vk(0x24)); // Home
        assert!(is_extended_vk(0x2D)); // Insert
        assert!(is_extended_vk(0x2E)); // Delete
        assert!(is_extended_vk(0xA3)); // Right Ctrl
        assert!(is_extended_vk(0xA5)); // Right Alt

        // Plain keys are NOT extended.
        assert!(!is_extended_vk(0x09)); // Tab
        assert!(!is_extended_vk(0x31)); // '1'
        assert!(!is_extended_vk(0x41)); // 'A'
        assert!(!is_extended_vk(0x14)); // CapsLock
        assert!(!is_extended_vk(0xAD)); // Volume Mute
    }
}
