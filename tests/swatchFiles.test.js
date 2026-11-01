import { describe, it, expect } from 'vitest';
import { writeAse, writeGpl, writeJson, parseSwatchFile } from '../src/utils/swatchFiles';

const autumn = { name: 'Autumn', swatches: [
  { hex: '#8a1f11', name: 'Rust' }, { hex: '#f2ede3', name: 'Bone' }, { hex: '#c9a14c', name: 'Ochre' },
] };
const night = { name: 'Night', swatches: [{ hex: '#121212', name: 'Ink' }, { hex: '#2f8fe3', name: 'Blue' }] };

const buf = (data) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe('swatch files', () => {
  it('.ase keeps every library, colour and name', () => {
    expect(parseSwatchFile('lib.ase', buf(writeAse([autumn, night])))).toEqual([autumn, night]);
  });

  it('.gpl keeps the colours and names', () => {
    expect(parseSwatchFile('lib.gpl', buf(writeGpl(autumn)))).toEqual([autumn]);
  });

  it('.json keeps the colours and names', () => {
    expect(parseSwatchFile('lib.json', buf(writeJson(night)))).toEqual([night]);
  });

  it('spots an .ase file without the extension', () => {
    expect(parseSwatchFile('download', buf(writeAse([night])))).toEqual([night]);
  });
});
