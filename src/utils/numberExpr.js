// Typed number fields (v1.16): a value can be a sum, as in Illustrator.
//
//   12*3        → 36        (+ − * / and brackets; × ÷ and , as a decimal point too)
//   *2  /4      → the current value doubled / quartered
//   +5          → the current value plus 5 (only when `relative` is on;
//                 -5 is always minus five, since values can be negative)
//   210mm, 8.5in, 2cm, 12pt, 300px
//               → converted to the field's unit when it takes units (toUnit)
//
// evalNumber(text, { current, relative, toUnit }) → a number, or null when
// the text isn't a sum. toUnit(value, unit) converts a typed value with a
// unit suffix into the field's unit; without it, suffixes are ignored.

const UNIT = /^(mm|cm|in|pt|px|")/i;

export function evalNumber(text, { current = null, relative = false, toUnit = null } = {}) {
  if (text == null) return null;
  let s = String(text).trim().replace(/[×x](?=\s*[\d.(])/gi, '*').replace(/÷/g, '/').replace(/−/g, '-');
  // Commas: between thousands (1,200) they're dropped; otherwise (12,5) a decimal point.
  s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
  if (!s) return null;
  // Applied to the current value: "*2", "/4", and with `relative` "+5".
  if (current != null && Number.isFinite(+current)) {
    if (/^[*/]/.test(s) || (relative && s[0] === '+')) {
      s = `(${current})${s}`;
    }
  }
  let i = 0;
  const peek = () => { while (s[i] === ' ') i++; return s[i]; };

  // number [unit] | ( expr ) [unit] | -factor | +factor
  const factor = () => {
    const c = peek();
    if (c === '-') { i++; const v = factor(); return v == null ? null : -v; }
    if (c === '+') { i++; return factor(); }
    let v;
    if (c === '(') {
      i++;
      v = expr();
      if (v == null || peek() !== ')') return null;
      i++;
    } else {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) return null;
      i += m[0].length;
      v = parseFloat(m[0]);
    }
    peek();
    const u = UNIT.exec(s.slice(i));
    if (u) {
      i += u[0].length;
      const unit = u[0] === '"' ? 'in' : u[0].toLowerCase();
      if (toUnit) v = toUnit(v, unit);
    }
    return v;
  };
  const term = () => {
    let v = factor();
    while (v != null) {
      const c = peek();
      if (c !== '*' && c !== '/') break;
      i++;
      const r = factor();
      if (r == null) return null;
      v = c === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = () => {
    let v = term();
    while (v != null) {
      const c = peek();
      if (c !== '+' && c !== '-') break;
      i++;
      const r = term();
      if (r == null) return null;
      v = c === '+' ? v + r : v - r;
    }
    return v;
  };

  const v = expr();
  // Anything left over (a trailing %, °, ×) is a readout's own suffix: ignored.
  if (v == null || !Number.isFinite(v)) return null;
  const rest = s.slice(i).trim();
  if (rest && !/^[%°×a-z]*$/i.test(rest)) return null;
  return v;
}
