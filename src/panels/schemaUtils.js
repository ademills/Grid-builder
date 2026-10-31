// Helpers for settings schemas (see schema.jsx for the format).

// Surprise helpers: a random value in a range (snapped to step) or from a list.
export const range = (min, max, step = 0) => (r) => {
  const v = min + r() * (max - min);
  return step ? Math.round(v / step) * step : v;
};
export const oneOf = (list) => (r) => list[Math.floor(r() * list.length)];

export const resolve = (x, values, ctx) => (typeof x === 'function' ? x(values, ctx) : x);

export const visible = (item, values, ctx) => !item.showIf || item.showIf(values, ctx);

export function changesFor(field, v, values) {
  return field.onChange ? field.onChange(v, values) : { [field.key]: v };
}

// Surprise Me's changes for a schema: every visible field with a `surprise`.
// Visibility is checked against the values chosen so far, section by section,
// so e.g. letter options are only rolled when a word is in play.
export function surpriseValues(schema, values, r = Math.random, ctx = {}) {
  let next = { ...values };
  const changes = {};
  for (const sec of schema) {
    if (!visible(sec, next, ctx)) continue;
    for (const f of sec.fields) {
      if (!f.surprise || !visible(f, next, ctx)) continue;
      const out = f.type === 'custom' ? f.surprise(r, next) : changesFor(f, f.surprise(r, next), next);
      Object.assign(changes, out);
      next = { ...next, ...out };
    }
  }
  return changes;
}
