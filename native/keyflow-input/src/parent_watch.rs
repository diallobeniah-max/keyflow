//! Waits for the parent Electron process to die and posts WM_QUIT to the
//! hook thread so the helper exits and Windows keyboard input stays normal.

use windows_sys::Win32::Foundation::CloseHandle;
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, WaitForSingleObject,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};

/// Spawns a detached watcher thread. If the parent exits, the hook thread
/// gets WM_QUIT and the helper shuts down cleanly (fail-open).
pub fn spawn_parent_watch(parent_pid: u32, hook_thread_id: u32) {
    std::thread::spawn(move || {
        unsafe {
            let handle =
                OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE, 0, parent_pid);
            if handle.is_null() {
                return;
            }
            WaitForSingleObject(handle, u32::MAX);
            CloseHandle(handle);
            let _ = PostThreadMessageW(hook_thread_id, WM_QUIT, 0, 0);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_parent_is_ignored() {
        // OpenProcess with a bogus PID fails; the watcher must simply return.
        spawn_parent_watch(u32::MAX, 0);
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}
