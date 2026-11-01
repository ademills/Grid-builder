(function () {
  var KEY = 'mps-roadmap-cuts';
  var LABEL = { shipped: 'Shipped', partial: 'Partly done', open: 'Open', hold: 'On hold', cut: 'Suggest cut' };
  var items = Array.prototype.slice.call(document.querySelectorAll('.item'));
  var q = document.getElementById('q');
  var hideCut = document.getElementById('hidecut');
  var hideShip = document.getElementById('hideship');
  var newf = document.getElementById('newf');
  var cxActive = new Set(), stActive = new Set(), newOnly = false;
  var cuts = new Set();

  try { cuts = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* storage unavailable */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(Array.from(cuts))); } catch { /* storage unavailable */ } }

  function syncStatusButtons() {
    document.querySelectorAll('[data-status].chip-st, .ov-key').forEach(function (b) {
      b.setAttribute('aria-pressed', String(stActive.has(b.dataset.status)));
    });
  }

  function apply() {
    var term = q.value.trim().toLowerCase();
    var shown = 0, perSec = {};
    items.forEach(function (el) {
      var id = el.dataset.id, isCut = cuts.has(id), btn = el.querySelector('.cut');
      el.classList.toggle('is-cut', isCut);
      btn.setAttribute('aria-pressed', String(isCut));
      btn.textContent = isCut ? 'Cut ✓' : 'Cut';
      var ok = (!term || el.textContent.toLowerCase().indexOf(term) !== -1)
        && (!cxActive.size || cxActive.has(el.dataset.cx))
        && (!stActive.size || stActive.has(el.dataset.status))
        && (!newOnly || el.dataset.new === '1')
        && !(hideCut.checked && isCut)
        && !(hideShip.checked && el.dataset.status === 'shipped');
      el.hidden = !ok;
      if (ok) { shown++; var s = el.closest('.sec').dataset.sec; perSec[s] = (perSec[s] || 0) + 1; }
    });
    document.querySelectorAll('.sec[data-sec]').forEach(function (sec) {
      var n = perSec[sec.dataset.sec] || 0;
      sec.hidden = n === 0;
      sec.querySelector('[data-count-for]').textContent = n;
      var t = document.querySelector('[data-toc-count="' + sec.dataset.sec + '"]');
      if (t) t.textContent = n;
    });
    document.getElementById('shown').textContent = shown;
    document.getElementById('cutn').textContent = cuts.size;
    document.getElementById('empty').hidden = shown !== 0;
  }

  document.querySelectorAll('.chip[data-cx]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.dataset.cx;
      if (cxActive.has(v)) cxActive.delete(v); else cxActive.add(v);
      b.setAttribute('aria-pressed', String(cxActive.has(v)));
      apply();
    });
  });
  document.querySelectorAll('.chip-st, .ov-key').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.dataset.status;
      if (stActive.has(v)) stActive.delete(v); else stActive.add(v);
      syncStatusButtons();
      apply();
      if (b.classList.contains('ov-key')) document.querySelector('.bar').scrollIntoView({ block: 'start' });
    });
  });
  newf.addEventListener('click', function () {
    newOnly = !newOnly; newf.setAttribute('aria-pressed', String(newOnly)); apply();
  });
  q.addEventListener('input', apply);
  hideCut.addEventListener('change', apply);
  hideShip.addEventListener('change', apply);

  items.forEach(function (el) {
    el.querySelector('.cut').addEventListener('click', function () {
      var id = el.dataset.id;
      if (cuts.has(id)) cuts.delete(id); else cuts.add(id);
      save(); apply();
    });
  });

  var accept = document.getElementById('accept');
  accept.addEventListener('click', function () {
    items.forEach(function (el) { if (el.dataset.status === 'cut') cuts.add(el.dataset.id); });
    save(); apply();
    accept.textContent = 'Suggested cuts marked';
    setTimeout(function () { accept.textContent = accept.dataset.label; }, 2000);
  });
  accept.dataset.label = accept.textContent;

  var reset = document.getElementById('reset');
  var resetArmed = false;
  reset.addEventListener('click', function () {
    if (!cuts.size) return;
    if (!resetArmed) { resetArmed = true; reset.textContent = 'Click again to clear'; setTimeout(function () { resetArmed = false; reset.textContent = 'Clear cuts'; }, 3000); return; }
    resetArmed = false; reset.textContent = 'Clear cuts';
    cuts.clear(); save(); apply();
  });

  var copy = document.getElementById('copy');
  copy.addEventListener('click', function () {
    var kept = items.filter(function (el) { return !cuts.has(el.dataset.id) && el.dataset.status !== 'shipped'; })
      .map(function (el) {
        var plan = el.querySelector('.plan-badge');
        return el.dataset.id + ' ' + el.dataset.title + ' [' + el.dataset.cx + '] ' + LABEL[el.dataset.status] + (plan ? ' ' + plan.textContent : '');
      });
    var text = 'Keep (' + kept.length + ', shipped items left out):\n' + kept.join('\n') +
      (cuts.size ? '\n\nCut: ' + Array.from(cuts).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).join(', ') : '');
    function done(msg) { copy.textContent = msg; setTimeout(function () { copy.textContent = 'Copy kept list'; }, 2000); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch { /* copy blocked; reported below */ }
      document.body.removeChild(ta);
      done(ok ? 'Copied' : 'Copy failed');
    }
    try { navigator.clipboard.writeText(text).then(function () { done('Copied'); }, fallback); } catch { fallback(); }
  });

  apply();
})();
