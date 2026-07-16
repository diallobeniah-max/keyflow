use serde_json::Value;
use std::{fs, path::PathBuf};

pub fn data_dir() -> Result<PathBuf, String> {
    let mut dir = dirs::data_dir().ok_or("Could not find AppData directory")?;
    dir.push("keyflow");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn state_path() -> Result<PathBuf, String> {
    let mut path = data_dir()?;
    path.push("keyflow-state.json");
    Ok(path)
}

pub fn load_state() -> Result<Option<Value>, String> {
    let path = state_path()?;
    if !path.exists() { return Ok(None); }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(Some(value))
}

pub fn save_state(value: &Value) -> Result<(), String> {
    let path = state_path()?;
    let raw = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}
