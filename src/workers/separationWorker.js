import PathKitInit from 'pathkit-wasm/bin/pathkit.js';
import wasmUrl from 'pathkit-wasm/bin/pathkit.wasm?url';
import { divideGroupUnitePathKit } from '../utils/colourSeparation.js';

const pkPromise = PathKitInit({ locateFile: () => wasmUrl });

self.onmessage = async ({ data }) => {
  if (data.type !== 'separate') return;
  try {
    const PathKit = await pkPromise;
    const { blockShapesList } = data;
    const totalBlocks = blockShapesList.length;

    // Divide + unite within each block independently
    const blockResults = blockShapesList.map((shapes, bi) =>
      divideGroupUnitePathKit(shapes, PathKit, (pct) => {
        // Cap at 99 so 100 is only posted once the done message is about to send
        const overall = Math.min(99, Math.round((bi * 100 + pct) / totalBlocks));
        self.postMessage({ type: 'progress', value: overall });
      })
    );

    // Collect all per-block path strings grouped by colour.
    // Blocks don't overlap in a grid layout, so same-colour paths across blocks
    // can be concatenated directly — no cross-block UNION needed.
    const orderSeen = new Set();
    const orderFinal = [];
    const allDs = {};

    for (const { order, united } of blockResults) {
      for (const fill of order) {
        if (!orderSeen.has(fill)) { orderFinal.push(fill); orderSeen.add(fill); }
        if (!allDs[fill]) allDs[fill] = [];
        if (united[fill]) allDs[fill].push(united[fill]);
      }
    }

    const united = {};
    for (const fill of orderFinal) {
      const ds = allDs[fill];
      united[fill] = ds?.length ? ds.join(' ') : null;
    }

    self.postMessage({ type: 'done', result: { order: orderFinal, united } });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
