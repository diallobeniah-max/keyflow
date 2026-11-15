#![windows_subsystem = "windows"]
use lcms2::{Intent, PixelFormat, Profile, Transform};
use std::io::{self, Read, Write};

// Bounded protocol: LE profile length, optional ICC profile, then Lab pixels.
// No paths or shell commands come from the file being previewed.
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut stdin = io::stdin().lock();
    let mut length = [0u8; 4];
    stdin.read_exact(&mut length)?;
    let size = u32::from_le_bytes(length) as usize;
    if size > 4 * 1024 * 1024 { return Err("profile too large".into()); }
    let mut profile = vec![0; size];
    stdin.read_exact(&mut profile)?;
    let profile = if profile.is_empty() { include_bytes!("lab-d50.icc").as_slice() } else { profile.as_slice() };
    let lab = Profile::new_icc(profile).map_err(|_| "invalid Lab profile")?;
    let srgb = Profile::new_srgb();
    let transform: Transform<u8, u8> = Transform::new(&lab, PixelFormat::Lab_8, &srgb, PixelFormat::RGB_8, Intent::Perceptual).map_err(|_| "invalid Lab transform")?;
    let mut input = Vec::new();
    const MAX_PIXELS: u64 = 2048 * 2048 * 3;
    stdin.take(MAX_PIXELS + 1).read_to_end(&mut input)?;
    if input.len() as u64 > MAX_PIXELS || input.len() % 3 != 0 { return Err("invalid pixel data".into()); }
    let mut output = vec![0; input.len()];
    transform.transform_pixels(&input, &mut output);
    io::stdout().lock().write_all(&output)?;
    Ok(())
}

fn main() { if run().is_err() { std::process::exit(1); } }
