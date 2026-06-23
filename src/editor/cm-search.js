export function initSearch(cm, container) {
  let marks = [];
  let matches = [];
  let matchIndex = -1;
  let query = '';
  let panel = null;
  let input = null;
  let countEl = null;

  function clearMarks() {
    marks.forEach(m => m.clear());
    marks = [];
  }

  function buildMarks(activeIdx) {
    clearMarks();
    matches.forEach((m, i) => {
      marks.push(cm.markText(m.from, m.to, {
        className: i === activeIdx ? 'cm-search-active' : 'cm-search-match',
      }));
    });
  }

  function findMatches(q) {
    matches = [];
    if (!q) { clearMarks(); updateCount(); return; }
    const text = cm.getValue();
    const qLow = q.toLowerCase();
    const tLow = text.toLowerCase();
    let pos = 0;
    while (pos < tLow.length) {
      const idx = tLow.indexOf(qLow, pos);
      if (idx === -1) break;
      matches.push({ from: cm.posFromIndex(idx), to: cm.posFromIndex(idx + q.length) });
      pos = idx + 1;
    }
  }

  function goTo(i) {
    if (!matches.length) return;
    matchIndex = ((i % matches.length) + matches.length) % matches.length;
    buildMarks(matchIndex);
    cm.scrollIntoView({ from: matches[matchIndex].from, to: matches[matchIndex].to }, 60);
    cm.setCursor(matches[matchIndex].from);
    updateCount();
  }

  function runSearch(q) {
    query = q;
    findMatches(q);
    if (matches.length) goTo(matchIndex >= 0 ? Math.min(matchIndex, matches.length - 1) : 0);
    else { clearMarks(); updateCount(); }
  }

  function updateCount() {
    if (!countEl) return;
    countEl.textContent = matches.length
      ? `${matchIndex + 1}/${matches.length}`
      : (query ? 'no results' : '');
  }

  function openPanel() {
    if (panel) { input.focus(); input.select(); return; }

    panel = document.createElement('div');
    panel.className = 'cm-search-panel';

    input = document.createElement('input');
    input.className = 'cm-search-input';
    input.placeholder = 'Find…';
    input.spellcheck = false;

    countEl = document.createElement('span');
    countEl.className = 'cm-search-count';

    const prev = document.createElement('button');
    prev.className = 'cm-search-btn';
    prev.title = 'Previous (Shift+Enter)';
    prev.textContent = '↑';

    const next = document.createElement('button');
    next.className = 'cm-search-btn';
    next.title = 'Next (Enter)';
    next.textContent = '↓';

    const close = document.createElement('button');
    close.className = 'cm-search-btn cm-search-close';
    close.title = 'Close (Escape)';
    close.textContent = '✕';

    panel.append(input, countEl, prev, next, close);
    container.appendChild(panel);

    input.addEventListener('input', () => runSearch(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goTo(matchIndex - 1) : goTo(matchIndex + 1); }
      if (e.key === 'Escape') closePanel();
      e.stopPropagation();
    });
    prev.addEventListener('click', () => goTo(matchIndex - 1));
    next.addEventListener('click', () => goTo(matchIndex + 1));
    close.addEventListener('click', closePanel);

    input.focus();
    const sel = cm.getSelection();
    if (sel && !sel.includes('\n')) { input.value = sel; runSearch(sel); }
  }

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    input = null;
    countEl = null;
    clearMarks();
    matches = [];
    matchIndex = -1;
    query = '';
    cm.focus();
  }

  cm.addKeyMap({ 'Ctrl-F': openPanel, 'Cmd-F': openPanel });

  return { open: openPanel, close: closePanel };
}
