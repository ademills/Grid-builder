import { describe, it, expect } from 'vitest';
import { layerMaskSettings } from '../src/modes/linework/masks';
import { lineworkLayerDefaults, mergeLineworkSettings } from '../src/modes/linework/settings';

describe('Linework region masks are per layer', () => {
  const doc = { src: 'doc.svg', threshold: 0.5 };

  it('uses the layer’s own settings for its mask, else the document’s', () => {
    const plain = lineworkLayerDefaults({ mask: 'silhouette' });
    const own = lineworkLayerDefaults({ mask: 'silhouette', maskSettings: { silhouette: { src: 'own.svg', threshold: 0.2 } } });
    expect(layerMaskSettings(plain, doc)).toBe(doc);
    expect(layerMaskSettings(own, doc).src).toBe('own.svg');
  });

  it('keeps settings for one mask when the layer switches to another', () => {
    const L = lineworkLayerDefaults({ mask: 'noise', maskSettings: { silhouette: { src: 'own.svg' } } });
    expect(layerMaskSettings(L, doc)).toBe(doc);
    expect(layerMaskSettings({ ...L, mask: 'silhouette' }, doc).src).toBe('own.svg');
  });

  it('gives older documents’ layers an empty set of their own', () => {
    const s = mergeLineworkSettings({ layers: [{ mask: 'word' }, { id: 'p1', mask: 'noise' }] });
    expect(s.layers.map(l => l.maskSettings)).toEqual([{}, {}]);
  });
});
