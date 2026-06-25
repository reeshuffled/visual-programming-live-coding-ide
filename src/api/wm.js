// Window manager: draggable/resizable floating windows + named tiling layouts.
// All layout coords are 0–1 fractions of desktop size, resolved to px at apply time.

// All windows are spawned (no built-in/special windows). Layouts position tiled windows; floating windows manage themselves.

import * as Tone from 'tone';

// ── File browser helpers ──────────────────────────────────────────────────────

function _fileIcon(ext) {
  if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return '🖼';
  if (['mp4','webm','mov','avi','mkv'].includes(ext)) return '🎬';
  if (['mp3','wav','ogg','flac','aac','m4a'].includes(ext)) return '🎵';
  if (['js','ts','jsx','tsx','mjs'].includes(ext)) return '📜';
  if (['wgsl','glsl'].includes(ext)) return '✨';
  if (['json'].includes(ext)) return '{ }';
  return '📄';
}

function _lcExt(name) {
  return name.replace(/(\.[^.]+)$/, m => m.toLowerCase());
}

function _makeFileEntry(entry, depth, onSelect) {
  const li = document.createElement('div');
  li.style.cssText = 'font-family:monospace;font-size:11px;white-space:nowrap;user-select:none;';

  const row = document.createElement('div');
  row.style.cssText = `display:flex;align-items:center;gap:5px;padding:3px 8px 3px ${8 + depth * 14}px;cursor:pointer;`;

  if (entry.kind === 'directory') {
    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = 'font-size:7px;color:#888;display:inline-block;width:8px;transition:transform 0.15s;flex-shrink:0;';
    const icon = document.createElement('span');
    icon.textContent = '📁';
    const name = document.createElement('span');
    name.textContent = entry.name;
    name.style.color = '#333';
    row.appendChild(arrow); row.appendChild(icon); row.appendChild(name);
    li.appendChild(row);

    let expanded = false;
    let childContainer = null;
    row.addEventListener('click', async () => {
      expanded = !expanded;
      arrow.style.transform = expanded ? 'rotate(90deg)' : '';
      if (expanded && !childContainer) {
        childContainer = document.createElement('div');
        li.appendChild(childContainer);
        await _renderDirContents(childContainer, entry, depth + 1, onSelect);
      }
      if (childContainer) childContainer.style.display = expanded ? '' : 'none';
    });
  } else {
    const spacer = document.createElement('span');
    spacer.style.cssText = 'width:8px;display:inline-block;flex-shrink:0;';
    const icon = document.createElement('span');
    icon.textContent = _fileIcon(entry.name.split('.').pop().toLowerCase());
    const name = document.createElement('span');
    name.textContent = _lcExt(entry.name);
    name.style.color = '#222';
    row.appendChild(spacer); row.appendChild(icon); row.appendChild(name);
    li.appendChild(row);

    row.addEventListener('click', async () => {
      const file = await entry.getFile();
      const url = URL.createObjectURL(file);
      onSelect?.(url, _lcExt(entry.name), entry);
    });
  }

  row.addEventListener('mouseenter', () => { row.style.background = '#e8f0fe'; });
  row.addEventListener('mouseleave', () => { row.style.background = ''; });
  return li;
}

function _pickDirViaInput() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      document.body.removeChild(input);
      const files = [...input.files];
      if (!files.length) { resolve(null); return; }
      const name = files[0].webkitRelativePath?.split('/')[0] || 'Files';
      resolve({ name, files });
    });
    input.click();
  });
}

async function _exitFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
}

function _pickFileViaInput(opts = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    if (opts.accept) input.accept = opts.accept;
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      document.body.removeChild(input);
      const file = input.files[0];
      resolve(file ? URL.createObjectURL(file) : null);
    });
    input.click();
  });
}

function _renderFlatFiles(container, files, onSelect) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const file of sorted) {
    if (file.name.startsWith('.')) continue;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:5px;padding:3px 8px;cursor:pointer;font-family:monospace;font-size:11px;white-space:nowrap;';
    const icon = document.createElement('span');
    icon.textContent = _fileIcon(file.name.split('.').pop().toLowerCase());
    const name = document.createElement('span');
    name.textContent = _lcExt(file.name);
    name.style.color = '#222';
    row.appendChild(icon);
    row.appendChild(name);
    row.addEventListener('click', () => {
      const url = URL.createObjectURL(file);
      onSelect?.(url, _lcExt(file.name), null);
    });
    row.addEventListener('mouseenter', () => { row.style.background = '#e8f0fe'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });
    container.appendChild(row);
  }
}

async function _renderDirContents(container, dirHandle, depth, onSelect) {
  const entries = [];
  for await (const entry of dirHandle.values()) entries.push(entry);
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    container.appendChild(_makeFileEntry(entry, depth, onSelect));
  }
}

// ── IndexedDB handle store (FileSystemFileHandle survives page reload) ────────
const _IDB_NAME = 'vl-wm-handles';
const _IDB_STORE = 'handles';

function _openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(_IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _storeWinHandle(winId, handle) {
  try {
    const db = await _openHandleDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(_IDB_STORE, 'readwrite');
      tx.objectStore(_IDB_STORE).put(handle, winId);
      tx.oncomplete = res; tx.onerror = rej;
    });
    db.close();
  } catch (_) {}
}

async function _loadWinHandle(winId) {
  try {
    const db = await _openHandleDB();
    const handle = await new Promise((res, rej) => {
      const req = db.transaction(_IDB_STORE).objectStore(_IDB_STORE).get(winId);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = rej;
    });
    db.close();
    return handle;
  } catch (_) { return null; }
}

async function _deleteWinHandle(winId) {
  try {
    const db = await _openHandleDB();
    const tx = db.transaction(_IDB_STORE, 'readwrite');
    tx.objectStore(_IDB_STORE).delete(winId);
    db.close();
  } catch (_) {}
}

export function initWM(onContentResize) {
  const desktop = document.getElementById('desktop');
  let zTop = 100;
  const savedGeometry = new Map();
  const spawnedIds = new Set();
  const fileHandles = new Map();
  const _droppedFileHandles = [];
  const _browseRefreshCbs = new Set();
  let spawnCounter = 0;

  // Release a window from the owning editor's keepAlive set (if registered)
  function _releaseWin(win) {
    win._wmKeepAliveSet?.delete(win);
    win._wmKeepAliveSet = null;
  }

  // ── Undo / redo history ───────────────────────────────────────────────────
  const _wmHistory = [];
  const _wmRedoHistory = [];
  const _WM_HISTORY_MAX = 50;
  let _wmHistoryDebounce = null;

  function _captureState() {
    const wins = [];
    desktop.querySelectorAll('.wm-win').forEach(win => {
      const entry = {
        id: win.id,
        x: parseInt(win.style.left)   || 0,
        y: parseInt(win.style.top)    || 0,
        w: parseInt(win.style.width)  || 320,
        h: parseInt(win.style.height) || 240,
        visible:     win.style.display !== 'none' && !win._wmMinimized,
        maximized:   win.classList.contains('wm-maximized'),
        nochrome:    win.classList.contains('wm-no-chrome'),
        transparent: win.classList.contains('wm-transparent'),
        _restore:    win._wmRestoreHandler ?? null,
      };
      if (spawnedIds.has(win.id)) {
        const opts = win._wmSpawnOpts;
        if (opts && !['canvas','shader','camera'].includes(opts.type)) {
          entry.spawned = true;
          entry.title = win.querySelector('.wm-title')?.textContent ?? opts.title;
          entry.type  = opts.type;
          entry.html  = opts.html;
          entry.src   = opts.src;
          entry.loop  = opts.loop;
        }
      }
      wins.push(entry);
    });
    return wins;
  }

  function _applySnapshot(snapshot) {
    snapshot.forEach(entry => {
      const win = document.getElementById(entry.id);
      if (win) {
        win.style.left   = `${entry.x}px`;
        win.style.top    = `${entry.y}px`;
        win.style.width  = `${entry.w}px`;
        win.style.height = `${entry.h}px`;
        if (entry.visible && win.style.display === 'none') {
          win.style.display = 'flex';
          win._wmMinimized  = false;
          taskbar.querySelector(`[data-win-id="${entry.id}"]`)?.remove();
          if (!taskbar.querySelector('.wm-taskbar-chip')) taskbar.style.display = 'none';
        }
        win.classList.toggle('wm-no-chrome',   !!entry.nochrome);
        win.classList.toggle('wm-transparent', !!entry.transparent);
      } else if (entry.spawned) {
        const id = api.spawn(entry.title, {
          id: entry.id, type: entry.type,
          x: entry.x, y: entry.y, w: entry.w, h: entry.h,
          html: entry.html, src: entry.src, loop: entry.loop,
        });
        const newWin = id && document.getElementById(id);
        if (newWin) {
          if (entry.nochrome)    newWin.classList.add('wm-no-chrome');
          if (entry.transparent) newWin.classList.add('wm-transparent');
        }
      } else if (entry._restore) {
        entry._restore();
      }
    });
  }

  function _pushSnapshot(snapshot) {
    _wmRedoHistory.length = 0;
    _wmHistory.push(snapshot);
    if (_wmHistory.length > _WM_HISTORY_MAX) _wmHistory.shift();
    _updateHistoryBtns();
  }

  function _pushHistory() {
    // Capture immediately so snapshot reflects state *before* the op.
    // Debounce: rapid ops (e.g. drag) collapse into one undo step.
    if (_wmHistoryDebounce) return;
    const snapshot = _captureState();
    _wmHistoryDebounce = setTimeout(() => {
      _wmHistoryDebounce = null;
      _pushSnapshot(snapshot);
    }, 500);
  }

  function _undoHistory() {
    const snapshot = _wmHistory.pop();
    if (!snapshot) return;
    _wmRedoHistory.push(_captureState());
    _applySnapshot(snapshot);
    _updateHistoryBtns();
    _saveState();
  }

  function _redoHistory() {
    const snapshot = _wmRedoHistory.pop();
    if (!snapshot) return;
    _wmHistory.push(_captureState());
    _applySnapshot(snapshot);
    _updateHistoryBtns();
    _saveState();
  }

  function _updateHistoryBtns() {
    const u = document.getElementById('undoWinBtn');
    const r = document.getElementById('redoWinBtn');
    if (u) { u.toggleAttribute('disabled', !_wmHistory.length);     u.style.opacity = _wmHistory.length     ? '1' : '0.4'; }
    if (r) { r.toggleAttribute('disabled', !_wmRedoHistory.length); r.style.opacity = _wmRedoHistory.length ? '1' : '0.4'; }
  }

  // ── State persistence ─────────────────────────────────────────────────────
  const _SAVE_KEY = 'vl-wm-state';
  let _savePending = null;

  function _flushState() {
    const wins = [];
    desktop.querySelectorAll('.wm-win').forEach(win => {
      const entry = {
        id: win.id,
        x: parseInt(win.style.left)  || 0,
        y: parseInt(win.style.top)   || 0,
        w: parseInt(win.style.width) || 320,
        h: parseInt(win.style.height)|| 240,
        visible:     win.style.display !== 'none' && !win._wmMinimized,
        maximized:   win.classList.contains('wm-maximized'),
        nochrome:    win.classList.contains('wm-no-chrome'),
        transparent: win.classList.contains('wm-transparent'),
      };
      if (spawnedIds.has(win.id)) {
        const opts = win._wmSpawnOpts;
        if (!opts) return;
        if (['canvas','shader','camera'].includes(opts.type)) return;
        const isBlobSrc = opts.src?.startsWith('blob:');
        entry.spawned = true;
        entry.title   = win.querySelector('.wm-title')?.textContent ?? opts.title;
        entry.type    = opts.type;
        if (opts.html !== undefined) entry.html = opts.html;
        if (!isBlobSrc && opts.src !== undefined) entry.src = opts.src;
        if (opts.loop !== undefined) entry.loop = opts.loop;
        if (isBlobSrc) entry.hasHandle = true; // handle stored in IndexedDB
      }
      wins.push(entry);
    });
    try { localStorage.setItem(_SAVE_KEY, JSON.stringify({ wins })); } catch (_) {}
  }

  function _saveState() {
    clearTimeout(_savePending);
    _savePending = setTimeout(_flushState, 400);
  }

  // ── Taskbar ────────────────────────────────────────────────────────────────
  const taskbar = document.createElement('div');
  taskbar.id = 'wm-taskbar';
  desktop.appendChild(taskbar);

  function _minimizeToTaskbar(win) {
    const winId = win.id;
    const title = win.querySelector('.wm-title')?.textContent ?? winId;
    savedGeometry.set(winId + '_min', { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height });
    win.style.display = 'none';
    win._wmMinimized = true;

    const chip = document.createElement('div');
    chip.className = 'wm-taskbar-chip';
    chip.dataset.winId = winId;
    const dot = document.createElement('span');
    dot.className = 'wm-chip-dot';
    const label = document.createElement('span');
    label.textContent = title;
    chip.appendChild(dot);
    chip.appendChild(label);
    chip.addEventListener('click', () => _restoreFromTaskbar(winId));
    taskbar.appendChild(chip);
    taskbar.style.display = 'flex';
  }

  function _restoreFromTaskbar(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    const saved = savedGeometry.get(winId + '_min');
    if (saved) { win.style.left = saved.left; win.style.top = saved.top; win.style.width = saved.width; win.style.height = saved.height; }
    win.style.display = 'flex';
    win._wmMinimized = false;
    taskbar.querySelector(`[data-win-id="${winId}"]`)?.remove();
    if (!taskbar.querySelector('.wm-taskbar-chip')) taskbar.style.display = 'none';
    bringToFront(win);
    onContentResize?.();
  }

  // Per-window Tone.Channel nodes — created lazily on first use
  const _channels = new Map();

  function _getChannel(winId) {
    if (!_channels.has(winId)) {
      const ch = new Tone.Channel().toDestination();
      _channels.set(winId, ch);
    }
    return _channels.get(winId);
  }

  function _disposeChannel(winId) {
    const ch = _channels.get(winId);
    if (ch) { try { ch.dispose(); } catch (_) {} _channels.delete(winId); }
  }

  // Inject ↔ / ↕ flip buttons into a window's titlebar.
  // target: the element to apply transform to (wm-body).
  function _addFlipBtns(win, target) {
    const tb = win.querySelector('.wm-titlebar');
    if (!tb) return;
    let flipH = false, flipV = false;
    const apply = () => {
      const sx = flipH ? -1 : 1, sy = flipV ? -1 : 1;
      target.style.transform = (sx === 1 && sy === 1) ? '' : `scale(${sx},${sy})`;
    };
    const mk = (icon, title, onClick) => {
      const b = document.createElement('span');
      b.className = 'wm-btn';
      b.title = title;
      b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
      b.addEventListener('click', onClick);
      return b;
    };
    const bH = mk('fa-left-right', 'Flip horizontal', () => { flipH = !flipH; bH.classList.toggle('active', flipH); apply(); });
    const bV = mk('fa-up-down',    'Flip vertical',   () => { flipV = !flipV; bV.classList.toggle('active', flipV); apply(); });
    const firstBtn = tb.querySelector('.wm-btn');
    tb.insertBefore(bV, firstBtn);
    tb.insertBefore(bH, bV);
  }

  // Inject mute + volume controls into a window's titlebar.
  // videoEl: optional <video> element to co-control (for spawned video windows).
  function _addAudioControls(win, videoEl) {
    const tb = win.querySelector('.wm-titlebar');
    if (!tb) return;

    const ctrl = document.createElement('span');
    ctrl.className = 'wm-audio-ctrl';

    const muteBtn = document.createElement('button');
    muteBtn.className = 'wm-mute';
    muteBtn.title = 'Mute';
    muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';

    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.className = 'wm-vol';
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.value = '100';
    volSlider.title = 'Volume';

    ctrl.appendChild(muteBtn);
    ctrl.appendChild(volSlider);

    const firstBtn = tb.querySelector('.wm-btn');
    tb.insertBefore(ctrl, firstBtn);

    let _muted = videoEl ? videoEl.muted : false;
    if (_muted) {
      muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
      muteBtn.classList.add('muted');
      volSlider.style.opacity = '0.4';
    }

    function _apply() {
      const linear = parseFloat(volSlider.value) / 100;
      if (videoEl) {
        videoEl.muted = _muted;
        videoEl.volume = _muted ? 0 : linear;
      }
      // Eagerly create channel so state is set even before user routes audio to it
      const ch = _getChannel(win.id);
      ch.mute = _muted;
      ch.volume.value = linear <= 0 ? -60 : (linear - 1) * 40;
    }

    muteBtn.addEventListener('click', e => {
      e.stopPropagation();
      _muted = !_muted;
      muteBtn.innerHTML = _muted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
      muteBtn.classList.toggle('muted', _muted);
      volSlider.style.opacity = _muted ? '0.4' : '1';
      _apply();
    });

    volSlider.addEventListener('input', e => {
      e.stopPropagation();
      if (_muted) {
        _muted = false;
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
        muteBtn.classList.remove('muted');
        volSlider.style.opacity = '1';
      }
      _apply();
    });

    // Prevent slider drag from bubbling to window drag handler
    volSlider.addEventListener('mousedown', e => e.stopPropagation());
  }

  function _addVideoControls(win, vid) {
    const tb = win.querySelector('.wm-titlebar');
    if (!tb) return;

    const playBtn = document.createElement('button');
    playBtn.className = 'wm-mute';
    playBtn.title = 'Play / Pause';
    playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';

    const update = () => {
      playBtn.innerHTML = vid.paused
        ? '<i class="fa-solid fa-play"></i>'
        : '<i class="fa-solid fa-pause"></i>';
    };

    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      vid.paused ? vid.play() : vid.pause();
    });

    vid.addEventListener('play', update);
    vid.addEventListener('pause', update);

    const syncBtn = document.createElement('button');
    syncBtn.className = 'wm-mute';
    syncBtn.title = 'Sync playback time with all other video windows';
    syncBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
    syncBtn.addEventListener('click', e => {
      e.stopPropagation();
      const t = vid.currentTime;
      desktop.querySelectorAll('.wm-body video').forEach(v => {
        if (v !== vid) { v.currentTime = t; if (!v.paused) v.play().catch(() => {}); }
      });
    });

    const audioCtrl = tb.querySelector('.wm-audio-ctrl');
    tb.insertBefore(syncBtn, audioCtrl);
    tb.insertBefore(playBtn, audioCtrl);
  }

  function _addCopyPathBtn(win, url) {
    const tb = win.querySelector('.wm-titlebar');
    if (!tb || !url) return;
    const btn = document.createElement('span');
    btn.className = 'wm-btn wm-copy-path';
    btn.title = 'Copy URL';
    btn.innerHTML = '<i class="fa-regular fa-clipboard"></i>';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard?.writeText(url).catch(() => {});
      btn.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-clipboard"></i>'; }, 1200);
    });
    const firstBtn = tb.querySelector('.wm-btn');
    tb.insertBefore(btn, firstBtn);
  }

  function getWin(id) { return document.getElementById(id); }

  function bringToFront(win) {
    win.style.zIndex = String(zTop++);
  }

  // Drag via titlebar, hover-strip, or body of content-only windows
  desktop.addEventListener('mousedown', e => {
    const tb = e.target.closest('.wm-titlebar');
    const hs = !tb && e.target.closest('.wm-hover-strip');
    const bd = !tb && !hs && (() => {
      const b = e.target.closest('.wm-body');
      return b?.closest('.wm-win')?.classList.contains('wm-draggable-body') ? b : null;
    })();
    if (!tb && !hs && !bd) return;
    if (e.target.closest('.wm-btn')) return;
    if (e.target.closest('[contenteditable="true"]')) return;
    if (bd && e.target.closest('select, input, button, a, textarea')) return;
    const win = (tb || hs || bd).closest('.wm-win');
    bringToFront(win);
    const ox = e.clientX - win.offsetLeft;
    const oy = e.clientY - win.offsetTop;
    const preSnap = _captureState();
    let _moved = false;
    const onMove = e => {
      _moved = true;
      const dw = desktop.offsetWidth, dh = desktop.offsetHeight;
      win.style.left = `${Math.max(0, Math.min(dw - 80,  e.clientX - ox))}px`;
      win.style.top  = `${Math.max(0, Math.min(dh - 28,  e.clientY - oy))}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (_moved) _pushSnapshot(preSnap);
      onContentResize?.();
      _saveState();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });

  // Resize via edge/corner handles
  desktop.addEventListener('mousedown', e => {
    const handle = e.target.closest('.wm-resize-handle');
    if (!handle) return;
    const dir = handle.dataset.resize;
    const win = handle.closest('.wm-win');
    bringToFront(win);
    const sx = e.clientX, sy = e.clientY;
    const sw = win.offsetWidth, sh = win.offsetHeight;
    const sl = win.offsetLeft,  st = win.offsetTop;
    const preSnap = _captureState();
    let _resized = false;
    const onMove = e => {
      _resized = true;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (dir.includes('e')) win.style.width  = `${Math.max(180, sw + dx)}px`;
      if (dir.includes('s')) win.style.height = `${Math.max(80,  sh + dy)}px`;
      if (dir.includes('w')) {
        const nw = Math.max(180, sw - dx);
        win.style.width = `${nw}px`;
        win.style.left  = `${sl + sw - nw}px`;
      }
      if (dir.includes('n')) {
        const nh = Math.max(80, sh - dy);
        win.style.height = `${nh}px`;
        win.style.top    = `${st + sh - nh}px`;
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (_resized) _pushSnapshot(preSnap);
      onContentResize?.();
      _saveState();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
    e.stopPropagation();
  });

  // Click window to bring to front
  desktop.addEventListener('mousedown', e => {
    const win = e.target.closest('.wm-win');
    if (win) bringToFront(win);
  }, true);

  // Duplicate button
  desktop.addEventListener('click', e => {
    if (!e.target.closest('.wm-dup')) return;
    const win = e.target.closest('.wm-win');
    if (!win?._wmSpawnOpts) return;
    const { title: t, ...savedOpts } = win._wmSpawnOpts;
    api.spawn(t, {
      ...savedOpts,
      id: undefined,
      x: win.offsetLeft + 24,
      y: win.offsetTop  + 24,
      w: win.offsetWidth,
      h: win.offsetHeight,
    });
  });

  // Minimize button
  desktop.addEventListener('click', e => {
    if (!e.target.closest('.wm-min')) return;
    const win = e.target.closest('.wm-win');
    if (win) { _pushHistory(); _minimizeToTaskbar(win); }
  });

  // Close button — supports custom _wmOnClose handler (e.g. editor)
  desktop.addEventListener('click', e => {
    if (!e.target.classList.contains('wm-close')) return;
    const win = e.target.closest('.wm-win');
    _pushHistory();
    if (win._wmOnClose) {
      win._wmOnClose(); // handler responsible for removal
      _saveState();
      return;
    }
    if (spawnedIds.has(win.id)) {
      _releaseWin(win);
      win._wmCleanup?.();
      win._wmRescueContent?.();
      _disposeChannel(win.id);
      _deleteWinHandle(win.id);
      win.remove();
      spawnedIds.delete(win.id);
      win._wmUserOnClose?.();
    } else {
      win.style.display = 'none';
    }
    _saveState();
  });

  // Maximize / restore button
  desktop.addEventListener('click', e => {
    const btn = e.target.closest('.wm-max');
    if (!btn) return;
    const win = btn.closest('.wm-win');
    _pushHistory();
    _toggleMaximize(win, btn);
    onContentResize?.();
    _saveState();
  });

  function _toggleMaximize(win, btn) {
    btn = btn || win.querySelector('.wm-max');
    if (win.classList.contains('wm-maximized')) {
      const saved = savedGeometry.get(win.id);
      if (saved) {
        win.style.left   = saved.left;
        win.style.top    = saved.top;
        win.style.width  = saved.width;
        win.style.height = saved.height;
      }
      win.classList.remove('wm-maximized');
      if (btn) { btn.innerHTML = '<i class="fa-regular fa-window-maximize"></i>'; btn.title = 'Maximize'; }
    } else {
      savedGeometry.set(win.id, {
        left:   win.style.left,
        top:    win.style.top,
        width:  win.style.width,
        height: win.style.height,
      });
      win.style.left   = '0';
      win.style.top    = '0';
      win.style.width  = '100%';
      win.style.height = '100%';
      win.style.zIndex = String(zTop++);
      win.classList.add('wm-maximized');
      if (btn) { btn.innerHTML = '<i class="fa-solid fa-window-restore"></i>'; btn.title = 'Restore'; }
    }
  }

  // True only when the click lands on the text content itself (not empty flex space)
  function _onTitleText(titleEl, e) {
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    for (const rect of range.getClientRects()) {
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) return true;
    }
    return false;
  }

  // Rename: double-click title label text only
  desktop.addEventListener('dblclick', e => {
    const title = e.target.closest('.wm-title');
    if (!title || !_onTitleText(title, e)) return;
    const original = title.textContent;
    title.contentEditable = 'true';
    title.focus();
    const range = document.createRange();
    range.selectNodeContents(title);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const commit = () => {
      title.contentEditable = 'false';
      title.removeEventListener('blur', commit);
      title.removeEventListener('keydown', onKey);
      const win = title.closest('.wm-win');
      win?._wmOnTitleChange?.(title.textContent.trim());
    };
    const onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { title.textContent = original; commit(); }
    };
    title.addEventListener('blur', commit);
    title.addEventListener('keydown', onKey);
  });

  // Dblclick titlebar background → toggle chrome-less mode
  desktop.addEventListener('dblclick', e => {
    const tb = e.target.closest('.wm-titlebar');
    if (!tb) return;
    if (e.target.closest('.wm-btn')) return;
    const titleEl = e.target.closest('.wm-title');
    if (titleEl && _onTitleText(titleEl, e)) return; // let rename handler take it
    tb.closest('.wm-win').classList.toggle('wm-no-chrome');
  });

  // Dblclick hover-strip → restore titlebar
  desktop.addEventListener('dblclick', e => {
    if (!e.target.closest('.wm-hover-strip')) return;
    e.target.closest('.wm-win').classList.remove('wm-no-chrome');
  });

  // Ghost button → toggle transparent window
  desktop.addEventListener('click', e => {
    const btn = e.target.closest('.wm-ghost');
    if (!btn) return;
    const win = btn.closest('.wm-win');
    if (!win) return;
    win.classList.toggle('wm-transparent');
    btn.classList.toggle('wm-ghost-on', win.classList.contains('wm-transparent'));
  });

  // Drop files from OS onto desktop → spawn image/video window at cursor
  desktop.addEventListener('dragover', e => {
    if (e.dataTransfer && [...e.dataTransfer.items].some(i => i.kind === 'file')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  desktop.addEventListener('drop', async e => {
    if (!e.dataTransfer || ![...e.dataTransfer.items].some(i => i.kind === 'file')) return;
    e.preventDefault();
    // Capture handles synchronously before event clears (getAsFileSystemHandle is async but must be initiated now)
    const items = [...e.dataTransfer.items];
    const handlePromises = items.map(i => i.getAsFileSystemHandle?.() ?? Promise.resolve(null));
    const deskRect = desktop.getBoundingClientRect();
    const dropX = e.clientX - deskRect.left;
    const dropY = e.clientY - deskRect.top;
    const handles = await Promise.all(handlePromises);
    let offsetX = 0;
    let anyNew = false;
    for (const handle of handles) {
      if (!handle || handle.kind !== 'file') continue;
      _droppedFileHandles.push(handle);
      anyNew = true;
      const file = await handle.getFile();
      const ext = file.name.split('.').pop().toLowerCase();
      const isImg = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif'].includes(ext);
      const isVid = ['mp4','webm','mov','avi','mkv'].includes(ext);
      if (isImg || isVid) {
        const url = URL.createObjectURL(file);
        const x = Math.max(0, dropX - 160 + offsetX);
        const y = Math.max(0, dropY - 14);
        const id = api.spawn(file.name, { type: isImg ? 'image' : 'video', src: url, x, y });
        await _storeWinHandle(id, handle);
        offsetX += 24;
      }
    }
    if (anyNew) {
      if (_browseRefreshCbs.size === 0) {
        api.browse('__nav_files__', (url, name) => {
          const ext = name.split('.').pop().toLowerCase();
          const isImg = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif'].includes(ext);
          const isVid = ['mp4','webm','mov','avi','mkv'].includes(ext);
          if (isImg) api.spawn(name, { type: 'image', src: url, w: 480, h: 360 });
          else if (isVid) api.spawn(name, { type: 'video', src: url, w: 640, h: 480 });
        }, { x: Math.max(0, dropX + 20), y: Math.max(0, dropY - 100) }).catch(() => {});
      } else {
        _browseRefreshCbs.forEach(fn => fn());
      }
    }
  });

  // Pre-existing built-in windows have no audio output — no controls needed.

  // ── Audio visualizer window builder ───────────────────────────────────────

  function _buildVizWindow(win, body, opts = {}) {
    body.style.cssText += 'flex-direction:column;padding:0;overflow:hidden;background:#0d0d1a;';

    // Controls bar
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'display:flex;align-items:center;gap:5px;padding:4px 8px;background:#13131f;border-bottom:1px solid #2a2a3e;flex-shrink:0;';

    const sourceSelect = document.createElement('select');
    sourceSelect.style.cssText = 'flex:1;min-width:0;font-size:11px;background:#1e1e2e;color:#cdd6f4;border:1px solid #313244;border-radius:3px;padding:2px 4px;';

    const styleSelect = document.createElement('select');
    styleSelect.style.cssText = 'font-size:11px;background:#1e1e2e;color:#cdd6f4;border:1px solid #313244;border-radius:3px;padding:2px 4px;';
    for (const s of ['wave', 'bars', 'ring']) {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      styleSelect.appendChild(o);
    }

    ctrl.appendChild(sourceSelect);
    ctrl.appendChild(styleSelect);
    body.appendChild(ctrl);

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'flex:1;width:100%;min-height:0;display:block;';
    body.appendChild(canvas);

    new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    }).observe(canvas);

    // State
    let rafId = null;
    let toneAn = null;   // Tone.Analyser for master / channel sources
    let rawAn  = null;   // raw AnalyserNode for mic / video sources
    const audioCtx = Tone.getContext().rawContext;

    function refreshSources() {
      const prev = sourceSelect.value;
      sourceSelect.innerHTML = '';
      const srcs = [
        { id: 'master', label: 'Master Output' },
        { id: 'mic',    label: 'Mic' },
      ];
      desktop.querySelectorAll('.wm-win').forEach(w => {
        if (w === win) return;
        const title = w.querySelector('.wm-title')?.textContent?.trim() || w.id;
        if (w.querySelector('video')) srcs.push({ id: 'vid:' + w.id, label: title + ' · video' });
        if (_channels.has(w.id))     srcs.push({ id: 'ch:'  + w.id, label: title + ' · channel' });
      });
      for (const { id, label } of srcs) {
        const o = document.createElement('option');
        o.value = id; o.textContent = label; o.selected = id === prev;
        sourceSelect.appendChild(o);
      }
      if (!sourceSelect.value) sourceSelect.selectedIndex = 0;
    }

    function disconnect() {
      if (toneAn) { try { toneAn.dispose(); } catch (_) {} toneAn = null; }
      if (rawAn && rawAn !== window.__ar_mic_analyser) {
        try { rawAn.disconnect(); } catch (_) {}
      }
      rawAn = null;
    }

    function connect(id) {
      disconnect();
      if (id === 'master') {
        toneAn = new Tone.Analyser({ type: styleSelect.value === 'wave' ? 'waveform' : 'fft', size: 128 });
        Tone.getDestination().connect(toneAn);
      } else if (id === 'mic') {
        rawAn = window.__ar_mic_analyser; // may be null until mic is toggled on
      } else if (id.startsWith('vid:')) {
        const vid = document.getElementById(id.slice(4))?.querySelector('video');
        if (vid) {
          if (!vid._ar_mediaSource) {
            vid._ar_mediaSource = audioCtx.createMediaElementSource(vid);
            vid._ar_mediaSource.connect(audioCtx.destination);
          }
          const an = audioCtx.createAnalyser();
          an.fftSize = 256; an.smoothingTimeConstant = 0.8;
          vid._ar_mediaSource.connect(an);
          rawAn = an;
        }
      } else if (id.startsWith('ch:')) {
        const ch = _channels.get(id.slice(3));
        if (ch) {
          toneAn = new Tone.Analyser({ type: styleSelect.value === 'wave' ? 'waveform' : 'fft', size: 128 });
          ch.connect(toneAn);
        }
      }
    }

    // Draw loop
    const c2d = canvas.getContext('2d');

    function frame() {
      rafId = requestAnimationFrame(frame);
      const W = canvas.width, H = canvas.height;
      if (!W || !H) return;

      // Re-fetch mic analyser each frame — it's created lazily
      if (sourceSelect.value === 'mic' && !rawAn) rawAn = window.__ar_mic_analyser;

      c2d.fillStyle = '#0d0d1a';
      c2d.fillRect(0, 0, W, H);

      let vals; // Float32Array, 0–1
      if (toneAn) {
        const raw = toneAn.getValue();
        vals = Float32Array.from(raw, v => Math.max(0, Math.min(1, (v + 100) / 100)));
      } else if (rawAn) {
        const buf = new Uint8Array(rawAn.frequencyBinCount);
        styleSelect.value === 'wave'
          ? rawAn.getByteTimeDomainData(buf)
          : rawAn.getByteFrequencyData(buf);
        vals = Float32Array.from(buf, v => styleSelect.value === 'wave' ? v / 128 - 1 : v / 255);
      } else return;

      const n = vals.length;
      const style = styleSelect.value;
      const dpr = devicePixelRatio;

      if (style === 'bars') {
        const bw = W / n;
        for (let i = 0; i < n; i++) {
          const v = vals[i];
          c2d.fillStyle = `hsl(${(i / n) * 240 + 180},80%,${30 + v * 35}%)`;
          c2d.fillRect(i * bw, H - v * H, Math.max(1, bw - 1), v * H);
        }
      } else if (style === 'wave') {
        c2d.beginPath();
        c2d.strokeStyle = '#89dceb';
        c2d.lineWidth = 2 * dpr;
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * W;
          const y = H / 2 - vals[i] * (H / 2);
          i === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
        }
        c2d.stroke();
      } else { // ring
        const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.28;
        c2d.beginPath();
        c2d.strokeStyle = '#cba6f7';
        c2d.lineWidth = 2 * dpr;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const v = vals[i % n];
          const rad = r + v * r * 0.7;
          const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
          i === 0 ? c2d.moveTo(x, y) : c2d.lineTo(x, y);
        }
        c2d.closePath();
        c2d.stroke();
      }
    }

    win._vizSourceEl = sourceSelect;
    win._vizStyleEl  = styleSelect;

    sourceSelect.addEventListener('mousedown', refreshSources);
    sourceSelect.addEventListener('change', () => {
      connect(sourceSelect.value);
    });
    styleSelect.addEventListener('change', () => {
      if (toneAn) toneAn.type = styleSelect.value === 'wave' ? 'waveform' : 'fft';
    });

    refreshSources();
    const initSrc = opts.source ?? 'master';
    styleSelect.value = opts.style ?? 'wave';
    if ([...sourceSelect.options].some(o => o.value === initSrc)) sourceSelect.value = initSrc;
    connect(sourceSelect.value);
    frame();

    win._wmCleanup = () => { cancelAnimationFrame(rafId); disconnect(); };
  }

  // Restore a file-backed window from IndexedDB handle
  async function _restoreFileWindow(s) {
    const handle = await _loadWinHandle(s.id);
    if (!handle) return;
    let perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'prompt') {
      // Can't call requestPermission without user gesture — show placeholder
      const plId = api.spawn(s.title, {
        type: 'html',
        html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;font-family:Arial,sans-serif;font-size:12px;color:#666;padding:16px;text-align:center;">
          <i class="fa-solid fa-file-circle-question" style="font-size:24px;color:#aaa;"></i>
          <div>${s.title}</div>
          <button id="_restore_${s.id}" style="margin-top:4px;padding:5px 12px;border:none;border-radius:4px;background:#1565c0;color:#fff;cursor:pointer;font-size:11px;">Restore file</button>
        </div>`,
        x: s.x, y: s.y, w: s.w, h: s.h,
        id: s.id,
      });
      const win = document.getElementById(plId);
      if (s.nochrome)    win?.classList.add('wm-no-chrome');
      if (s.transparent) win?.classList.add('wm-transparent');
      document.getElementById(`_restore_${s.id}`)?.addEventListener('click', async () => {
        perm = await handle.requestPermission({ mode: 'read' });
        if (perm !== 'granted') return;
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        const img = win?.querySelector('.wm-body img');
        const vid = win?.querySelector('.wm-body video');
        if (img) { img.src = url; return; }
        if (vid) { vid.src = url; return; }
        // Replace placeholder with real content
        const ext = file.name.split('.').pop().toLowerCase();
        const isImg = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif'].includes(ext);
        win?.remove(); spawnedIds.delete(s.id);
        const newId = api.spawn(s.title, { type: isImg ? 'image' : 'video', src: url, x: s.x, y: s.y, w: s.w, h: s.h });
        await _storeWinHandle(newId, handle);
      });
      return;
    }
    if (perm !== 'granted') return;
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop().toLowerCase();
    const isImg = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif'].includes(ext);
    const id = api.spawn(s.title, { type: isImg ? 'image' : 'video', src: url, x: s.x, y: s.y, w: s.w, h: s.h, id: s.id });
    await _storeWinHandle(id, handle);
    const win = document.getElementById(id);
    if (s.nochrome)    win?.classList.add('wm-no-chrome');
    if (s.transparent) win?.classList.add('wm-transparent');
  }

  // ── Sensor gauge window builder ───────────────────────────────────────────

  function _buildSensorWindow(win, body, opts = {}) {
    const source = opts.source || 'motion'; // 'motion' | 'gamepad' | 'geo' | 'battery'
    body.style.cssText += 'flex-direction:column;padding:0;overflow:hidden;background:#0d0d1a;';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'flex:1;width:100%;min-height:0;display:block;';
    body.appendChild(canvas);

    new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    }).observe(canvas);

    const dpr = () => devicePixelRatio;
    let rafId;

    function _gauge(ctx, cx, cy, r, value, min, max, label, color) {
      const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const startA = Math.PI * 0.75, endA = Math.PI * 2.25;
      const angle = startA + pct * (endA - startA);
      ctx.save();
      ctx.strokeStyle = '#1e1e2e';
      ctx.lineWidth = r * 0.22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.78, startA, endA);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.78, startA, angle);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(r * 0.34)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value.toFixed(value < 100 ? 1 : 0), cx, cy - r * 0.08);
      ctx.fillStyle = '#6c7086';
      ctx.font = `${Math.round(r * 0.22)}px sans-serif`;
      ctx.fillText(label, cx, cy + r * 0.35);
      ctx.restore();
    }

    function _bar(ctx, x, y, w, h, value, min, max, label, color) {
      const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y + h * (1 - pct), w, h * pct);
      ctx.fillStyle = '#6c7086';
      ctx.font = `${Math.round(h * 0.09)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h + h * 0.12);
    }

    function draw() {
      rafId = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      if (!W || !H) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0d0d1a';
      ctx.fillRect(0, 0, W, H);

      const sensors = window.sensors;

      if (source === 'motion') {
        const m = sensors?.motion?.() ?? { ax: 0, ay: 0, az: 0, alpha: 0, beta: 0, gamma: 0, magnitude: 0 };
        const cols = ['#f38ba8', '#a6e3a1', '#89b4fa', '#fab387', '#cba6f7', '#f9e2af'];
        const fields = [
          { v: m.ax ?? 0, mn: -20, mx: 20, lbl: 'ax (m/s²)' },
          { v: m.ay ?? 0, mn: -20, mx: 20, lbl: 'ay (m/s²)' },
          { v: m.az ?? 0, mn: -20, mx: 20, lbl: 'az (m/s²)' },
          { v: m.alpha ?? 0, mn: 0, mx: 360, lbl: 'α (yaw)' },
          { v: m.beta  ?? 0, mn: -180, mx: 180, lbl: 'β (pitch)' },
          { v: m.gamma ?? 0, mn: -90,  mx: 90,  lbl: 'γ (roll)' },
        ];
        const n = fields.length;
        const colW = W / n;
        const barW = colW * 0.5;
        const barH = H * 0.78;
        const barY = H * 0.06;
        fields.forEach(({ v, mn, mx, lbl }, i) => {
          _bar(ctx, colW * i + (colW - barW) / 2, barY, barW, barH, v, mn, mx, lbl, cols[i % cols.length]);
        });
      } else if (source === 'gamepad') {
        const pad = sensors?.gamepad?.(0) ?? {};
        const axes = [0, 1, 2, 3].map(i => pad.axis?.(i) ?? 0);
        const btns = [0, 1, 2, 3].map(i => pad.pressed?.(i) ?? false);
        const n = axes.length;
        const r = Math.min(W / (n * 2.4), H * 0.34);
        const cols = ['#89b4fa', '#a6e3a1', '#f38ba8', '#fab387'];
        axes.forEach((v, i) => {
          _gauge(ctx, W * (i + 0.5) / n, H * 0.42, r, v, -1, 1, `axis ${i}`, cols[i]);
        });
        btns.forEach((pressed, i) => {
          const bx = W * (i + 0.5) / n;
          ctx.beginPath();
          ctx.arc(bx, H * 0.82, r * 0.22, 0, Math.PI * 2);
          ctx.fillStyle = pressed ? '#a6e3a1' : '#1e1e2e';
          ctx.fill();
          ctx.fillStyle = '#6c7086';
          ctx.font = `${Math.round(r * 0.22)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`btn${i}`, bx, H * 0.82);
        });
      } else if (source === 'geo') {
        const geo = sensors?.geo?.() ?? {};
        const lines = [
          `lat:  ${geo.lat?.toFixed(5) ?? '—'}`,
          `lon:  ${geo.lon?.toFixed(5) ?? '—'}`,
          `alt:  ${geo.altitude != null ? geo.altitude.toFixed(1) + ' m' : '—'}`,
          `spd:  ${geo.speed != null ? geo.speed.toFixed(1) + ' m/s' : '—'}`,
          `hdg:  ${geo.heading != null ? geo.heading.toFixed(0) + '°' : '—'}`,
          `acc:  ${geo.accuracy != null ? '±' + geo.accuracy.toFixed(0) + ' m' : '—'}`,
          !geo.ready ? '⟳ acquiring…' : (geo.error ? `⚠ ${geo.error}` : '✓ ready'),
        ];
        const fs = Math.min(H * 0.1, W * 0.06, 18 * dpr());
        ctx.fillStyle = '#cdd6f4';
        ctx.font = `${fs}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, W * 0.08, H * 0.1 + i * fs * 1.5));
      } else if (source === 'battery') {
        const bat = window.__ar_battery_last ?? {};
        const pct = bat.level ?? 0;
        const charging = bat.charging ?? false;
        const bw = W * 0.55, bh = H * 0.34;
        const bx = (W - bw) / 2, by = (H - bh) / 2;
        ctx.strokeStyle = '#cdd6f4'; ctx.lineWidth = 2 * dpr();
        ctx.strokeRect(bx, by, bw, bh);
        const tipW = bw * 0.06, tipH = bh * 0.35;
        ctx.fillStyle = '#cdd6f4';
        ctx.fillRect(bx + bw, by + (bh - tipH) / 2, tipW, tipH);
        const fill = bw * pct;
        ctx.fillStyle = charging ? '#a6e3a1' : pct < 0.2 ? '#f38ba8' : '#89b4fa';
        ctx.fillRect(bx, by, fill, bh);
        const fs = Math.min(bh * 0.42, 18 * dpr());
        ctx.fillStyle = '#cdd6f4';
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(pct * 100)}%${charging ? ' ⚡' : ''}`, W / 2, H / 2);
        if (bat.timeToFull > 0) {
          ctx.font = `${fs * 0.55}px sans-serif`;
          ctx.fillText(`~${Math.round(bat.timeToFull / 60)} min to full`, W / 2, H / 2 + fs * 0.9);
        } else if (bat.timeToEmpty > 0 && bat.timeToEmpty !== Infinity) {
          ctx.font = `${fs * 0.55}px sans-serif`;
          ctx.fillText(`~${Math.round(bat.timeToEmpty / 60)} min left`, W / 2, H / 2 + fs * 0.9);
        }
      }
    }

    rafId = requestAnimationFrame(draw);
    win._wmCleanup = () => cancelAnimationFrame(rafId);

    // For battery: cache latest reading for the RAF draw loop
    if (source === 'battery' && window.sensors?.battery) {
      window.sensors.battery().then(bat => {
        window.__ar_battery_last = { level: bat.level, charging: bat.charging, timeToFull: bat.timeToFull, timeToEmpty: bat.timeToEmpty };
        bat.onChange(() => {
          window.__ar_battery_last = { level: bat.level, charging: bat.charging, timeToFull: bat.timeToFull, timeToEmpty: bat.timeToEmpty };
        });
      }).catch(() => {});
    }
  }

  // ── Public API (exposed as window.wm) ────────────────────────────────────

  const api = {
    /** Show a window by id */
    show(id) {
      const win = getWin(id);
      if (!win) return api;
      win.style.display = 'flex';
      bringToFront(win);
      return api;
    },

    /** Hide a window by id (spawned windows removed) */
    hide(id) {
      const win = getWin(id);
      if (!win) return api;
      if (spawnedIds.has(id)) {
        _releaseWin(win);
        win._wmCleanup?.();
        win.remove();
        spawnedIds.delete(id);
      } else {
        win.style.display = 'none';
      }
      _saveState();
      return api;
    },

    /** Alias for hide */
    close(id) { api.hide(id); return api; },

    /** Undo last destructive window operation */
    undo() { _undoHistory(); return api; },

    /** Redo last undone window operation */
    redo() { _redoHistory(); return api; },

    /** Snapshot current state onto undo stack (call before custom destructive ops) */
    pushHistory() { _pushHistory(); return api; },

    /** Close (delete) all windows */
    closeAll() {
      _pushHistory();
      [...spawnedIds].forEach(id => {
        const win = getWin(id);
        if (!win) { spawnedIds.delete(id); return; }
        _releaseWin(win);
        win._wmCleanup?.();
        _disposeChannel(id);
        _deleteWinHandle(id);
        win.remove();
        spawnedIds.delete(id);
      });
      clearTimeout(_savePending);
      _savePending = null;
      try { localStorage.setItem(_SAVE_KEY, JSON.stringify({ wins: [] })); } catch (_) {}
      return api;
    },



    // Apply a WebGPU shader directly inside a window.
    // code: WGSL fragment body string or full WGSL.
    // opts: any Shader constructor opts — pass video: to feed a source, or omit to auto-detect.
    // Returns the started Shader instance.
    applyShader(id, code, opts = {}) {
      const win = getWin(id);
      if (!win) return null;
      const body = win.querySelector('.wm-body');
      if (!body) return null;

      // Auto-detect video source from window type if not provided
      let video = opts.video ?? null;
      if (!video) {
        const wo = win._wmSpawnOpts;
        if (wo?.type === 'camera') {
          video = document.getElementById('camera');
        } else if (wo?.type === 'shader') {
          video = wo.shader?.canvas ?? null;
        } else {
          // pick the first canvas or video element already in the body
          video = body.querySelector('canvas, video') ?? null;
        }
      }

      const { Shader: S } = window; // avoid import cycle — Shader is on window
      if (!S) { console.warn('wm.applyShader: Shader not available'); return null; }
      const s = new S(code, { ...opts, video, container: body });
      s.start();
      return s;
    },

    /** Toggle visibility */
    toggle(id) {
      const win = getWin(id);
      if (!win) return api;
      if (win.style.display === 'none') api.show(id); else api.hide(id);
      return api;
    },

    /** Bring window to front */
    focus(id) {
      const win = getWin(id);
      if (win) bringToFront(win);
      return api;
    },

    /** Move window to pixel coords */
    move(id, x, y) {
      const win = getWin(id);
      if (!win) return api;
      win.style.left = `${x}px`;
      win.style.top  = `${y}px`;
      return api;
    },

    /** Resize window in pixels */
    resize(id, w, h) {
      const win = getWin(id);
      if (!win) return api;
      win.style.width  = `${Math.max(180, w)}px`;
      win.style.height = `${Math.max(80,  h)}px`;
      onContentResize?.();
      return api;
    },

    /** Maximize a window */
    maximize(id) {
      const win = getWin(id);
      if (!win || win.classList.contains('wm-maximized')) return api;
      _toggleMaximize(win);
      onContentResize?.();
      return api;
    },

    /** Restore a maximized window */
    restore(id) {
      const win = getWin(id);
      if (!win || !win.classList.contains('wm-maximized')) return api;
      _toggleMaximize(win);
      onContentResize?.();
      return api;
    },

    /** Set CSS z-index on a window (stacking order) — live, no re-spawn needed */
    setZ(id, z) {
      const win = getWin(id);
      if (win) win.style.zIndex = String(z);
      return api;
    },

    /** Set CSS opacity on a window (0 = invisible, 1 = fully opaque) — live */
    setOpacity(id, v) {
      const win = getWin(id);
      if (win) win.style.opacity = String(v);
      return api;
    },

    /**
     * Spawn a new floating window.
     * @param {string} title  - Titlebar label
     * @param {object} [opts] - { type, x, y, w, h, id, ...type-specific }
     *   type: 'html'   → opts.html (string)
     *   type: 'image'  → opts.src (URL or blob URL)
     *   type: 'video'  → opts.src (URL or blob URL), opts.loop
     *   type: 'camera' → mirrors #camera canvas
     *   type: 'canvas' → opts.z (default 0) mirrors layer canvas at z
     *   type: 'shader' → opts.shader (Shader instance)
     *   type: 'viz'    → audio visualizer; source/style picker built-in
     * @returns {string}  window id
     */
    spawn(title, opts = {}) {
      const dw = desktop.offsetWidth, dh = desktop.offsetHeight;
      const id  = opts.id || `win-spawn-${++spawnCounter}`;
      const w   = opts.w  ?? 320;
      const h   = opts.h  ?? 240;
      const x   = opts.x  ?? Math.round((dw - w) / 2);
      const y   = opts.y  ?? Math.round((dh - h) / 2);
      const type = opts.type ?? 'html';

      const win = document.createElement('div');
      win.className = 'wm-win';
      win.id = id;
      win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;`;
      win.innerHTML = `
        <div class="wm-titlebar">
          <span class="wm-title">${title}</span>
          <span class="wm-btn wm-ghost" title="Toggle transparent"><i class="fa-solid fa-circle-half-stroke"></i></span>
          <span class="wm-btn wm-dup" title="Duplicate"><i class="fa-regular fa-copy"></i></span>
          <span class="wm-btn wm-min" title="Minimize">─</span>
          <span class="wm-btn wm-max" title="Maximize"><i class="fa-regular fa-window-maximize"></i></span>
          <span class="wm-btn wm-close" title="Close">×</span>
        </div>
        <div class="wm-body" style="overflow:auto;position:relative;"></div>
        <div class="wm-hover-strip"></div>
        <div class="wm-resize-handle" data-resize="n"></div>
        <div class="wm-resize-handle" data-resize="s"></div>
        <div class="wm-resize-handle" data-resize="e"></div>
        <div class="wm-resize-handle" data-resize="w"></div>
        <div class="wm-resize-handle" data-resize="ne"></div>
        <div class="wm-resize-handle" data-resize="nw"></div>
        <div class="wm-resize-handle" data-resize="se"></div>
        <div class="wm-resize-handle" data-resize="sw"></div>
      `;
      const body = win.querySelector('.wm-body');

      let _cleanup = null;

      if (type === 'html') {
        body.innerHTML = opts.html ?? '';
      } else if (type === 'image') {
        const img = document.createElement('img');
        img.src = opts.src ?? '';
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
        body.style.overflow = 'hidden';
        body.appendChild(img);
      } else if (type === 'video') {
        const vid = document.createElement('video');
        vid.src = opts.src ?? '';
        vid.style.cssText = 'width:100%;display:block;';
        vid.autoplay = true;
        vid.muted = true;
        vid.loop = opts.loop !== false;
        vid.disablePictureInPicture = true;
        vid.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
        body.style.overflow = 'hidden';
        body.style.background = '#000';
        body.appendChild(vid);
        vid.addEventListener('loadedmetadata', () => {
          const tb = win.querySelector('.wm-titlebar');
          const chrome = tb ? tb.getBoundingClientRect().height + 1 : 29;
          const desk = win.parentElement ?? document.getElementById('desktop');
          const capW = opts.w ?? 320;
          const capH = opts.h ?? 240;
          const maxW = Math.min(capW, desk ? desk.offsetWidth * 0.9 : vid.videoWidth);
          const maxH = Math.min(capH, desk ? desk.offsetHeight * 0.9 - chrome : vid.videoHeight);
          const scale = Math.min(1, maxW / vid.videoWidth, maxH / vid.videoHeight);
          win.style.width  = `${Math.round(vid.videoWidth  * scale)}px`;
          win.style.height = `${Math.round(vid.videoHeight * scale + chrome)}px`;
        }, { once: true });
        _cleanup = () => { vid.pause(); vid.src = ''; };
      } else if (type === 'viz') {
        _buildVizWindow(win, body, opts);
      } else if (type === 'sensor') {
        _buildSensorWindow(win, body, opts);
      } else if (type === 'camera' || type === 'canvas' || type === 'shader') {
        let src;
        if (type === 'camera') {
          src = document.getElementById('camera');
        } else if (type === 'canvas') {
          src = opts.canvas instanceof HTMLCanvasElement
            ? opts.canvas
            : window.__ar_layers?.get(opts.z ?? 0);
        } else {
          src = opts.shader?.canvas;
        }
        const getLayers = opts.getLayers; // () => sorted HTMLCanvasElement[]
        if (getLayers || src) {
          const dst = document.createElement('canvas');
          dst.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
          body.style.overflow = 'hidden';
          body.style.background = '#000';
          body.appendChild(dst);
          const ctx = dst.getContext('2d');
          let rafId;
          const copy = () => {
            if (getLayers) {
              const layers = getLayers().filter(c => !c._ar_webgpu);
              // Ping shader readable canvases so they blit within their own RAF
              layers.forEach(c => { if (c._ar_shaderReadable) c._ar_watched = true; });
              if (layers.length && layers[0].width) {
                dst.width  = layers[0].width;
                dst.height = layers[0].height;
                ctx.clearRect(0, 0, dst.width, dst.height);
                for (const c of layers) {
                  if (c.width && c.height) ctx.drawImage(c, 0, 0, dst.width, dst.height);
                }
              }
            } else if (src.width && src.height) {
              dst.width  = src.width;
              dst.height = src.height;
              ctx.drawImage(src, 0, 0);
            }
            rafId = requestAnimationFrame(copy);
          };
          rafId = requestAnimationFrame(copy);
          _cleanup = () => cancelAnimationFrame(rafId);
        }
      }

      if (_cleanup) win._wmCleanup = _cleanup;
      win._wmSpawnOpts = { title, ...opts };

      if (['image','video','camera','canvas','shader','viz','sensor'].includes(type)) {
        win.classList.add('wm-draggable-body');
      }

      if ((type === 'video' || type === 'html') && opts.audio !== false) {
        const videoEl = type === 'video' ? body.querySelector('video') : null;
        _addAudioControls(win, videoEl);
        if (videoEl) _addVideoControls(win, videoEl);
      }

      if (['image','video'].includes(type) && opts.src) _addCopyPathBtn(win, opts.src);
      if (['image','video','camera','canvas','shader','viz'].includes(type)) _addFlipBtns(win, body);
      if (opts.noChrome)    win.classList.add('wm-no-chrome');
      if (opts.transparent) win.classList.add('wm-transparent');

      if (opts.onClose) win._wmUserOnClose = opts.onClose;

      desktop.appendChild(win);
      spawnedIds.add(id);
      bringToFront(win);
      if (opts.z != null) win.style.zIndex = String(opts.z);

      // Register as a live output for the active editor run (if any).
      // The editor's _isLive() checks _keepAlive; removing here lets the idle watcher
      // detect that all outputs are gone and auto-stop.
      const _activeEdId = window.__ar_active_editor_id;
      const _activeInst = _activeEdId != null ? window.__ar_instances?.get(_activeEdId) : null;
      if (_activeInst?.btnState === 'running' && id !== _activeInst.canvasWinId) {
        _activeInst._keepAlive.add(win);
        _activeInst._hadOutput = true;
        win._wmKeepAliveSet = _activeInst._keepAlive;
      }

      _saveState();
      return id;
    },

    /** List all window ids currently in the desktop */
    list() {
      return [...desktop.querySelectorAll('.wm-win')].map(w => w.id);
    },

    /**
     * Pick a file via the browser file picker. Returns a blob URL.
     * Pass a key to cache the handle — subsequent calls reuse it without re-prompting.
     * @param {string} [key]   - cache key for the handle
     * @param {object} [opts]  - showOpenFilePicker options (types, multiple, etc.)
     * @returns {Promise<string>}  blob URL
     */
    async pickFile(key, opts = {}) {
      if (key && fileHandles.has(key)) {
        const handle = fileHandles.get(key);
        try {
          const perm = await handle.queryPermission({ mode: 'read' });
          if (perm === 'granted') {
            return URL.createObjectURL(await handle.getFile());
          }
        } catch (_) { /* handle stale — fall through to picker */ }
      }
      await _exitFullscreen();
      if (window.showOpenFilePicker) {
        try {
          const [handle] = await window.showOpenFilePicker({ multiple: false, ...opts });
          if (key) fileHandles.set(key, handle);
          return URL.createObjectURL(await handle.getFile());
        } catch (err) {
          if (err?.name === 'AbortError') throw err;
          // API blocked — fall through to input fallback
        }
      }
      const url = await _pickFileViaInput(opts);
      if (!url) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      return url;
    },

    /**
     * Open a local file browser window. Re-uses previously granted folder handles
     * without prompting; only shows a picker when no access has been granted yet
     * or when the user explicitly clicks "Add folder".
     * @param {string} [key]        - cache key for persisting handles across opens
     * @param {function} [onSelect] - called with (blobUrl, filename, fileHandle)
     * @param {object} [spawnOpts]  - { w, h, x, y, id } forwarded to spawn()
     * @returns {Promise<string>}  window id
     */
    async browse(key, onSelect, spawnOpts = {}) {
      const multiKey     = key ? key + '_multi'    : null;
      const fallbackKey  = key ? key + '_fallback' : null;

      let handles  = multiKey    ? (fileHandles.get(multiKey)    ? [...fileHandles.get(multiKey)] : []) : [];
      let fallback = fallbackKey ? (fileHandles.get(fallbackKey) ?? null) : null;

      // Only prompt when we have nothing cached yet (skip if dropped files already available)
      if (!handles.length && !fallback && !_droppedFileHandles.length) {
        if (window.showDirectoryPicker) {
          try {
            await _exitFullscreen();
            const h = await window.showDirectoryPicker({ mode: 'read' });
            handles.push(h);
            if (multiKey) fileHandles.set(multiKey, handles);
          } catch (err) {
            if (err?.name === 'AbortError') throw err;
          }
        }
        if (!handles.length) {
          fallback = await _pickDirViaInput();
          if (!fallback) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
          if (fallbackKey) fileHandles.set(fallbackKey, fallback);
        }
      }

      const winId = api.spawn('Local Files', {
        type: 'html', html: '', audio: false,
        w: spawnOpts.w ?? 260,
        h: spawnOpts.h ?? Math.min(120 + handles.length * 160, 520),
        x: spawnOpts.x, y: spawnOpts.y, id: spawnOpts.id,
      });
      const win = document.getElementById(winId);
      const body = win.querySelector('.wm-body');
      body.innerHTML = '';
      body.style.overflow = 'hidden';
      body.style.flexDirection = 'column';
      body.style.padding = '0';

      const list = document.createElement('div');
      list.style.cssText = 'flex:1;overflow:auto;padding:2px 0;';

      const footer = document.createElement('div');
      footer.style.cssText = 'flex-shrink:0;padding:5px 6px;border-top:1px solid #e0e0e0;background:#fafafa;';
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add folder';
      addBtn.style.cssText = 'width:100%;font-size:11px;padding:3px 8px;cursor:pointer;background:#f0f0f0;border:1px solid #ccc;border-radius:3px;';
      footer.appendChild(addBtn);
      body.appendChild(list);
      body.appendChild(footer);

      async function renderFolderSection(dh, container) {
        const header = document.createElement('div');
        header.style.cssText = 'padding:5px 8px 2px;font-size:9px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#888;border-top:1px solid #e8e8e8;margin-top:2px;';
        header.textContent = dh.name;
        container.appendChild(header);
        await _renderDirContents(container, dh, 0, onSelect);
      }

      async function renderAll() {
        list.innerHTML = '';
        if (fallback) {
          _renderFlatFiles(list, fallback.files, onSelect);
        } else {
          for (const h of handles) await renderFolderSection(h, list);
        }
        if (_droppedFileHandles.length) {
          const hdr = document.createElement('div');
          hdr.style.cssText = 'padding:5px 8px 2px;font-size:9px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#888;border-top:1px solid #e8e8e8;margin-top:2px;';
          hdr.textContent = 'Dropped';
          list.appendChild(hdr);
          for (const fh of _droppedFileHandles) {
            list.appendChild(_makeFileEntry(fh, 0, onSelect));
          }
        }
      }

      _browseRefreshCbs.add(renderAll);
      const prevCleanup = win._wmCleanup;
      win._wmCleanup = () => { _browseRefreshCbs.delete(renderAll); prevCleanup?.(); };

      addBtn.addEventListener('click', async () => {
        if (window.showDirectoryPicker) {
          try {
            await _exitFullscreen();
            const h = await window.showDirectoryPicker({ mode: 'read' });
            handles.push(h);
            if (multiKey) fileHandles.set(multiKey, handles);
          } catch (err) {
            if (err?.name === 'AbortError') return;
          }
        } else {
          const more = await _pickDirViaInput();
          if (!more) return;
          fallback = fallback
            ? { name: fallback.name, files: [...fallback.files, ...more.files] }
            : more;
          if (fallbackKey) fileHandles.set(fallbackKey, fallback);
        }
        try {
          const desk = win.parentElement;
          const maxH = desk ? desk.offsetHeight * 0.9 : 800;
          win.style.height = Math.min(parseInt(win.style.height) + 160, maxH) + 'px';
          await renderAll();
        } catch (err) {
          if (err?.name !== 'AbortError') console.warn('folder access denied', err);
        }
      });

      await renderAll();
      return winId;
    },

    /**
     * Get (or create) the Tone.Channel for a window.
     * Route audio to it: synth.connect(wm.channel('win-editor'))
     * The window's mute/volume controls will then affect that audio.
     */
    channel(id) { return _getChannel(id); },

    /** Register a FileSystemDirectoryHandle under a key so browse(key) re-uses it */
    registerFolder(key, handle) { fileHandles.set(key + '_multi', [handle]); },
    registerFolderFallback(key, fallback) { fileHandles.set(key + '_fallback', fallback); },

    async pickFolder() {
      if (window.showDirectoryPicker) {
        try {
          await _exitFullscreen();
          const handle = await window.showDirectoryPicker({ mode: 'read' });
          return { handle, name: handle.name };
        } catch (err) {
          if (err?.name === 'AbortError') return null;
        }
      }
      const fallback = await _pickDirViaInput();
      return fallback ? { fallback, name: fallback.name } : null;
    },

    /** Return the IndexedDB key for a file-backed window (key = winId) */
    fileKey(id) { return fileHandles.has(id) ? id : null; },

    /** Restore a file-backed window from IndexedDB (for project load) */
    restoreFileWindow(s) { _restoreFileWindow(s); },

    /** Force an immediate WM state save (call after removing windows from DOM) */
    saveState() { clearTimeout(_savePending); _flushState(); },

    /** Restore window state saved in localStorage */
    restoreState() {
      let state;
      try { state = JSON.parse(localStorage.getItem(_SAVE_KEY)); } catch (_) { return; }
      if (!state?.wins) return;

      for (const s of state.wins) {
        if (!s.spawned) continue;
        if (s.hasHandle) {
          _restoreFileWindow(s);
          continue;
        }
        // Window already exists (e.g. editor created from manifest) — restore geometry only
        const existing = s.id ? document.getElementById(s.id) : null;
        if (existing) {
          existing.style.display = s.visible ? 'flex' : 'none';
          existing.style.left   = `${s.x}px`;
          existing.style.top    = `${s.y}px`;
          existing.style.width  = `${s.w}px`;
          existing.style.height = `${s.h}px`;
          if (s.maximized)   _toggleMaximize(existing);
          if (s.nochrome)    existing.classList.add('wm-no-chrome');
          if (s.transparent) existing.classList.add('wm-transparent');
          continue;
        }
        const id = api.spawn(s.title, {
          id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h,
          html: s.html, src: s.src, loop: s.loop,
        });
        const win = document.getElementById(id);
        if (!win) continue;
        if (s.nochrome)    win.classList.add('wm-no-chrome');
        if (s.transparent) win.classList.add('wm-transparent');
      }

      onContentResize?.();
    },

  };

  _updateHistoryBtns(); // init state — both disabled on load
  return api;
}
