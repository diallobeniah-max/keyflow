use parking_lot::Mutex;
use serde_json::Value;

#[derive(Default)]
pub struct AppState {
    pub current_json: Mutex<Option<Value>>,
    pub paused: Mutex<bool>,
}
