// PNG / JPEG export: renders the exported SVG with resvg instead of the
// webview's canvas. That removes the canvas size cap (16,384 px a side),
// keeps memory flat for very large images (PNG is rendered and written in
// horizontal strips), and moves the work off the UI thread.

use std::fs::File;
use std::io::{BufWriter, Write};

use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};

/// Largest PNG side. JPEG is held in memory to encode, so it has a lower cap.
const MAX_PNG_SIDE: u32 = 32_768;
const MAX_JPEG_SIDE: u32 = 16_384;
/// Rough cap on one strip's pixel buffer.
const STRIP_BYTES: u64 = 64 * 1024 * 1024;

fn render_to_file(svg: &str, width: u32, height: u32, format: &str, quality: u8, path: &str) -> Result<(), String> {
  if width == 0 || height == 0 {
    return Err("The image has no size.".into());
  }
  let jpeg = format == "jpeg";
  let max = if jpeg { MAX_JPEG_SIDE } else { MAX_PNG_SIDE };
  if width > max || height > max {
    return Err(format!("{width} × {height} px is too large; {} export is limited to {max} px a side.", format.to_uppercase()));
  }

  let tree = Tree::from_str(svg, &Options::default()).map_err(|e| format!("Could not read the artwork: {e}"))?;
  let size = tree.size();
  // Render at 2× and average down, which hides hairline antialiasing seams
  // between neighbouring shapes, unless that would be needlessly large.
  let ss: u32 = if width.max(height) <= 16_384 { 2 } else { 1 };
  let sx = width as f32 / size.width() * ss as f32;
  let sy = height as f32 / size.height() * ss as f32;

  let row_bytes = width as u64 * ss as u64 * 4 * ss as u64;
  let strip_rows = ((STRIP_BYTES / row_bytes.max(1)) as u32).clamp(1, height);

  // Output rows go to the PNG stream, or into one RGB buffer for JPEG.
  let mut jpeg_buf: Vec<u8> = Vec::new();
  let mut png_stream = None;
  if jpeg {
    jpeg_buf.reserve(width as usize * height as usize * 3);
  } else {
    let file = File::create(path).map_err(|e| format!("Could not create {path}: {e}"))?;
    let mut enc = png::Encoder::new(BufWriter::new(file), width, height);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let writer = enc.write_header().map_err(|e| e.to_string())?;
    png_stream = Some(writer.into_stream_writer().map_err(|e| e.to_string())?);
  }

  let mut row = vec![0u8; width as usize * 4];
  let mut y0 = 0;
  while y0 < height {
    let rows = strip_rows.min(height - y0);
    let mut pixmap = Pixmap::new(width * ss, rows * ss).ok_or("Not enough memory to render the image.")?;
    let transform = Transform::from_row(sx, 0.0, 0.0, sy, 0.0, -((y0 * ss) as f32));
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    let data = pixmap.data(); // premultiplied RGBA
    let stride = (width * ss) as usize * 4;

    for r in 0..rows as usize {
      for x in 0..width as usize {
        // Average the ss × ss block (premultiplied), then un-premultiply.
        let (mut cr, mut cg, mut cb, mut ca) = (0u32, 0u32, 0u32, 0u32);
        for dy in 0..ss as usize {
          let base = (r * ss as usize + dy) * stride + x * ss as usize * 4;
          for dx in 0..ss as usize {
            let i = base + dx * 4;
            cr += data[i] as u32;
            cg += data[i + 1] as u32;
            cb += data[i + 2] as u32;
            ca += data[i + 3] as u32;
          }
        }
        let n = ss * ss;
        let (r_, g_, b_, a_) = (cr / n, cg / n, cb / n, ca / n);
        if jpeg {
          // Flatten onto white.
          let w = 255 - a_;
          jpeg_buf.extend_from_slice(&[(r_ + w).min(255) as u8, (g_ + w).min(255) as u8, (b_ + w).min(255) as u8]);
        } else {
          let o = x * 4;
          if a_ == 0 {
            row[o..o + 4].copy_from_slice(&[0, 0, 0, 0]);
          } else {
            row[o] = ((r_ * 255 + a_ / 2) / a_).min(255) as u8;
            row[o + 1] = ((g_ * 255 + a_ / 2) / a_).min(255) as u8;
            row[o + 2] = ((b_ * 255 + a_ / 2) / a_).min(255) as u8;
            row[o + 3] = a_ as u8;
          }
        }
      }
      if let Some(stream) = png_stream.as_mut() {
        stream.write_all(&row).map_err(|e| e.to_string())?;
      }
    }
    y0 += rows;
  }

  if let Some(stream) = png_stream {
    stream.finish().map_err(|e| e.to_string())?;
  } else {
    let encoder = jpeg_encoder::Encoder::new_file(path, quality.clamp(1, 100)).map_err(|e| format!("Could not create {path}: {e}"))?;
    encoder
      .encode(&jpeg_buf, width as u16, height as u16, jpeg_encoder::ColorType::Rgb)
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// Renders `svg` to a `width` × `height` PNG or JPEG at `path`.
#[tauri::command]
pub async fn render_raster(svg: String, width: u32, height: u32, format: String, quality: u8, path: String) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || render_to_file(&svg, width, height, &format, quality, &path))
    .await
    .map_err(|e| e.to_string())?
}
