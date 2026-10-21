// Swatch library file formats.
//   .ase  — Adobe Swatch Exchange (Illustrator, Photoshop, InDesign)
//   .gpl  — GIMP / Inkscape / Krita palette
//   .json — this app's own { name, swatches: [{ hex, name }] } (or a bare hex array)
//
// Every parser returns [{ name, swatches: [{ hex, name? }] }] — one library
// per swatch group in the file (ungrouped swatches form their own library).

const clamp01 = v => Math.min(1, Math.max(0, v));
const toHex = (r, g, b) => `#${[r, g, b].map(v => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;

function fromHex(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}

// CIE L*a*b* (D50, as ASE stores it) → sRGB.
function labToRgb(L, a, b) {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const f = t => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  x = 0.96422 * f(x); y = f(y); z = 0.82521 * f(z);
  // D50 → linear sRGB (Bradford-adapted matrix)
  const lr = 3.1338561 * x - 1.6168667 * y - 0.4906146 * z;
  const lg = -0.9787684 * x + 1.9161415 * y + 0.0334540 * z;
  const lb = 0.0719453 * x - 0.2289914 * y + 1.4052427 * z;
  const gamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return [gamma(lr), gamma(lg), gamma(lb)];
}

// ── ASE ──────────────────────────────────────────────────────────────────────

export function parseAse(buffer) {
  const view = new DataView(buffer);
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== 'ASEF') throw new Error('Not an Adobe Swatch Exchange file.');
  const blockCount = view.getUint32(8);
  let pos = 12;

  const readName = () => {
    const len = view.getUint16(pos); pos += 2;
    let name = '';
    for (let i = 0; i < len; i++) {
      const code = view.getUint16(pos); pos += 2;
      if (code) name += String.fromCharCode(code);
    }
    return name;
  };

  const ungrouped = { name: 'Imported swatches', swatches: [] };
  const groups = [];
  let current = ungrouped;

  for (let n = 0; n < blockCount && pos < buffer.byteLength; n++) {
    const type = view.getUint16(pos);
    const length = view.getUint32(pos + 2);
    pos += 6;
    const end = pos + length;
    if (type === 0xC001) {
      current = { name: readName() || 'Group', swatches: [] };
      groups.push(current);
    } else if (type === 0xC002) {
      current = ungrouped;
    } else if (type === 0x0001) {
      const name = readName();
      const model = String.fromCharCode(view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3));
      pos += 4;
      const f = (i) => view.getFloat32(pos + i * 4);
      let rgb = null;
      if (model === 'RGB ') rgb = [f(0), f(1), f(2)];
      else if (model === 'CMYK') { const [c, m, y, k] = [f(0), f(1), f(2), f(3)]; rgb = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]; }
      else if (model === 'LAB ') rgb = labToRgb(f(0) * 100, f(1), f(2));
      else if (model === 'Gray') rgb = [f(0), f(0), f(0)];
      if (rgb) {
        const hex = toHex(...rgb);
        // Unnamed swatches are often saved with their hex as the name.
        current.swatches.push({ hex, ...(name && name.toLowerCase() !== hex ? { name } : {}) });
      }
    }
    pos = end;
  }
  return [...(ungrouped.swatches.length ? [ungrouped] : []), ...groups.filter(g => g.swatches.length)];
}

// One group per library, every colour stored as a global RGB swatch.
export function writeAse(libraries) {
  const chunks = [];
  const u16 = v => { const b = new ArrayBuffer(2); new DataView(b).setUint16(0, v); chunks.push(new Uint8Array(b)); };
  const u32 = v => { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, v); chunks.push(new Uint8Array(b)); };
  const f32 = v => { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, v); chunks.push(new Uint8Array(b)); };
  const nameBytes = s => 2 + (s.length + 1) * 2;
  const name = s => { u16(s.length + 1); for (const ch of s) u16(ch.charCodeAt(0)); u16(0); };

  let blocks = 0;
  for (const lib of libraries) blocks += lib.swatches.length + 2;

  chunks.push(new TextEncoder().encode('ASEF'));
  u16(1); u16(0); u32(blocks);
  for (const lib of libraries) {
    u16(0xC001); u32(nameBytes(lib.name)); name(lib.name);
    for (const s of lib.swatches) {
      const label = s.name || s.hex.toUpperCase();
      u16(0x0001); u32(nameBytes(label) + 4 + 12 + 2);
      name(label);
      chunks.push(new TextEncoder().encode('RGB '));
      for (const v of fromHex(s.hex)) f32(v);
      u16(0); // global
    }
    u16(0xC002); u32(0);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ── GPL ──────────────────────────────────────────────────────────────────────

export function parseGpl(text) {
  const lines = text.split(/\r?\n/);
  if (!/^GIMP Palette/i.test(lines[0] ?? '')) throw new Error('Not a GIMP palette file.');
  let name = 'Imported palette';
  const swatches = [];
  for (const line of lines.slice(1)) {
    const nm = line.match(/^Name:\s*(.+)$/i);
    if (nm) { name = nm[1].trim(); continue; }
    const m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*(.*)$/);
    if (m) swatches.push({ hex: toHex(+m[1] / 255, +m[2] / 255, +m[3] / 255), ...(m[4].trim() && !/^untitled$/i.test(m[4].trim()) && m[4].trim().toLowerCase() !== toHex(+m[1] / 255, +m[2] / 255, +m[3] / 255) ? { name: m[4].trim() } : {}) });
  }
  return [{ name, swatches }];
}

export function writeGpl(library) {
  const rows = library.swatches.map(s => {
    const [r, g, b] = fromHex(s.hex).map(v => String(Math.round(v * 255)).padStart(3, ' '));
    return `${r} ${g} ${b}\t${s.name || s.hex.toUpperCase()}`;
  });
  return `GIMP Palette\nName: ${library.name}\nColumns: 8\n#\n${rows.join('\n')}\n`;
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function parseJson(text) {
  const data = JSON.parse(text);
  const norm = (list) => list.map(s => (typeof s === 'string' ? { hex: s } : { hex: s.hex, ...(s.name ? { name: s.name } : {}) }))
    .filter(s => /^#[0-9a-f]{6}$/i.test(s.hex));
  if (Array.isArray(data)) {
    if (data.length && typeof data[0] === 'object' && Array.isArray(data[0].swatches)) return data.map(l => ({ name: l.name, swatches: norm(l.swatches) }));
    return [{ name: 'Imported palette', swatches: norm(data) }];
  }
  if (Array.isArray(data.swatches)) return [{ name: data.name ?? 'Imported palette', swatches: norm(data.swatches) }];
  if (Array.isArray(data.colors)) return [{ name: data.name ?? 'Imported palette', swatches: norm(data.colors) }];
  throw new Error('No swatches found in this JSON file.');
}

export function writeJson(library) {
  return JSON.stringify({ name: library.name, swatches: library.swatches.map(s => ({ hex: s.hex, ...(s.name ? { name: s.name } : {}) })) }, null, 2);
}

// Picks a parser from the file name, falling back to sniffing the content.
export function parseSwatchFile(fileName, buffer) {
  const lower = fileName.toLowerCase();
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isAse = lower.endsWith('.ase') || String.fromCharCode(...bytes) === 'ASEF';
  if (isAse) return parseAse(buffer);
  const text = new TextDecoder().decode(buffer);
  if (lower.endsWith('.gpl') || /^GIMP Palette/i.test(text)) return parseGpl(text);
  return parseJson(text);
}
