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

pub fn is_f12(vk: u32) -> bool {
    vk == F12_VK
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
}
