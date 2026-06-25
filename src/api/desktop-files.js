// desktop-files.js — file icons on the IDE desktop (project-scoped)
//
// Two icon types:
//   'editor' — live link to a running EditorInstance. Clicking focuses the window.
//              Auto-created when an editor spawns, removed when destroyed.
//   file     — 'image'|'video'|'audio'|'code'|'file' from OS drop or desktop.add().
//              Content stored inline (data URL / text) so it survives project save/load.
//
// Project save/load: serializeDesktop() / restoreDesktop() — called from project.js.

const _icons  = new Map(); // id → icon object
let _wm       = null;
let _desktop  = null;
let _nextId   = 1;
const _onFileCbs = [];

// Positions saved from last restoreDesktop() call — picked up by addEditorIcon on spawn.
const _restoredPositions = new Map(); // editorId → {x, y}

const _DESKTOP_KEY = 'vl-desktop-state';

// ── Folder handle IDB persistence ─────────────────────────────────────────────
const _FOLDER_IDB   = 'vl-folder-icons';
const _FOLDER_STORE = 'icons';

function _openFolderDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_FOLDER_IDB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(_FOLDER_STORE, { autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _syncFoldersToDB() {
  try {
    const db = await _openFolderDB();
    const tx = db.transaction(_FOLDER_STORE, 'readwrite');
    const store = tx.objectStore(_FOLDER_STORE);
    store.clear();
    for (const icon of _icons.values()) {
      if (icon.type === 'folder' && icon.folderData?.handle)
        store.add({ handle: icon.folderData.handle, name: icon.name, x: icon.x, y: icon.y });
    }
    tx.oncomplete = () => db.close();
  } catch (_) {}
}

async function _loadFolderIcons() {
  try {
    const db = await _openFolderDB();
    const entries = await new Promise((res, rej) => {
      const req = db.transaction(_FOLDER_STORE).objectStore(_FOLDER_STORE).getAll();
      req.onsuccess = () => res(req.result ?? []);
      req.onerror = rej;
    });
    db.close();
    for (const { handle, name, x, y } of entries) _addFolderIcon({ handle, name }, x, y);
  } catch (_) {}
}
// ──────────────────────────────────────────────────────────────────────────────

function _saveDesktopState() {
  try { localStorage.setItem(_DESKTOP_KEY, JSON.stringify(serializeDesktop())); } catch (_) {}
  _syncFoldersToDB();
}
let _saveDragTimer = null;
function _saveDesktopStateDebounced() {
  clearTimeout(_saveDragTimer);
  _saveDragTimer = setTimeout(_saveDesktopState, 400);
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('dt-styles')) return;
  const s = document.createElement('style');
  s.id = 'dt-styles';
  s.textContent = `
.dt-icon {
  position: absolute; width: 76px; text-align: center;
  cursor: default; user-select: none;
  padding: 4px; border-radius: 6px; z-index: 2; box-sizing: border-box;
}
.dt-icon:hover { background: rgba(255,255,255,0.07); }
.dt-icon.dt-sel { background: rgba(100,150,255,0.22); outline: 1px solid rgba(100,160,255,0.45); }
.dt-icon.dt-editor-icon .dt-glyph { background: #1a2a3a; border: 1px solid #2a4a6a; font-size: 26px; color: #6ab0f5; }
.dt-icon.dt-active::after {
  content: ''; position: absolute; top: 4px; right: 4px;
  width: 8px; height: 8px; background: #4caf50; border-radius: 50%;
  border: 1.5px solid rgba(0,0,0,0.5); pointer-events: none;
}
.dt-trash {
  position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
  width: 52px; height: 52px; border-radius: 50%;
  background: rgba(200,50,50,0.12); border: 2px dashed rgba(200,50,50,0.4);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: rgba(200,50,50,0.45); z-index: 99996;
  pointer-events: none; opacity: 0; transition: opacity 0.15s, transform 0.15s;
}
.dt-trash.dt-trash-show { opacity: 1; }
.dt-trash.dt-trash-hover { background: rgba(200,50,50,0.45); transform: translateX(-50%) scale(1.18); color: rgba(255,80,80,0.9); }
.dt-icon.dt-folder-icon .dt-glyph { background: #2a2010; border: 1px solid #5a4010; font-size: 26px; color: #f0a830; }
.dt-thumb {
  width: 60px; height: 60px; object-fit: cover; border-radius: 5px;
  display: block; margin: 0 auto 5px; background: #222; pointer-events: none;
}
.dt-glyph {
  width: 60px; height: 60px; display: flex; align-items: center;
  justify-content: center; margin: 0 auto 5px; border-radius: 5px;
  background: #222; font-size: 28px; pointer-events: none;
}
.dt-label {
  font-size: 10px; color: #ddd; line-height: 1.3;
  text-shadow: 0 1px 3px #000, 0 0 8px #000;
  overflow: hidden; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  word-break: break-all;
}
.dt-label[contenteditable="true"] {
  display: block; overflow: visible; -webkit-line-clamp: unset;
  background: rgba(0,0,0,0.6); outline: 1px solid rgba(100,160,255,0.6);
  border-radius: 3px; padding: 1px 3px; cursor: text;
  text-shadow: none; color: #fff; white-space: pre-wrap;
}
.dt-ctx {
  position: fixed; background: #232323; border: 1px solid #454545;
  border-radius: 7px; padding: 4px 0; z-index: 99999;
  min-width: 180px; box-shadow: 0 8px 24px rgba(0,0,0,0.65);
  font-family: system-ui, sans-serif; font-size: 12px;
}
.dt-ctx-item { padding: 7px 16px; color: #ddd; cursor: pointer; white-space: nowrap; }
.dt-ctx-item:hover { background: #3a3a3a; color: #fff; }
.dt-ctx-sep { border-top: 1px solid #3a3a3a; margin: 4px 0; }
.dt-ctx-label { padding: 5px 16px 3px; color: #666; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
.dt-marquee {
  position: absolute; pointer-events: none; z-index: 99997; box-sizing: border-box;
  border: 1.5px solid rgba(100,160,255,0.75); background: rgba(100,150,255,0.12);
  border-radius: 2px;
}
#desktop.dt-hover::after {
  content: 'Drop files';
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.7); color: rgba(255,255,255,0.5);
  padding: 8px 20px; border-radius: 20px; font-size: 13px;
  pointer-events: none; z-index: 99998; border: 1px dashed rgba(255,255,255,0.2);
}
  `;
  document.head.appendChild(s);
}

// ── Type helpers ──────────────────────────────────────────────────────────────

function _classify(name, mime = '') {
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv|ogv)$/i.test(name))            return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a|opus)$/i.test(name))       return 'audio';
  if (/\.(js|ts|mjs|wgsl|glsl|json|html?|css|md|txt|yaml|toml)$/i.test(name))              return 'code';
  return 'file';
}

const _GLYPH = { image: '🖼', video: '🎬', audio: '🎵', code: '📄', file: '📁' };
const _FA_GLYPH = { editor: 'fa-solid fa-file-code', folder: 'fa-solid fa-folder' };
const _WM    = { image: 'image', video: 'video' };

// ── Trash zone ────────────────────────────────────────────────────────────────

let _trashEl = null;

function _ensureTrash() {
  if (_trashEl || !_desktop) return;
  _trashEl = document.createElement('div');
  _trashEl.className = 'dt-trash';
  _trashEl.innerHTML = '🗑';
  _desktop.appendChild(_trashEl);
}

function _trashShow() { _trashEl?.classList.add('dt-trash-show'); }
function _trashHide() { _trashEl?.classList.remove('dt-trash-show', 'dt-trash-hover'); }

function _overTrash(clientX, clientY) {
  if (!_trashEl) return false;
  const r = _trashEl.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

// ── Icon DOM ──────────────────────────────────────────────────────────────────

function _makeThumb(icon) {
  if (icon.type === 'image' && icon.url) {
    const img = document.createElement('img');
    img.className = 'dt-thumb';
    img.src = icon.url;
    img.alt = '';
    return img;
  }
  if (icon.type === 'video' && icon.url) {
    const vid = document.createElement('video');
    vid.className = 'dt-thumb';
    vid.src = icon.url;
    vid.muted = true;
    vid.preload = 'metadata';
    vid.addEventListener('loadedmetadata', () => { vid.currentTime = 0.5; }, { once: true });
    return vid;
  }
  const g = document.createElement('div');
  g.className = 'dt-glyph';
  if (_FA_GLYPH[icon.type]) {
    const i = document.createElement('i');
    i.className = _FA_GLYPH[icon.type];
    g.appendChild(i);
  } else {
    g.textContent = _GLYPH[icon.type] ?? '📁';
  }
  return g;
}

function _buildEl(icon) {
  const el = document.createElement('div');
  el.className = 'dt-icon' + (icon.type === 'editor' ? ' dt-editor-icon' : icon.type === 'folder' ? ' dt-folder-icon' : '');
  el.style.left = icon.x + 'px';
  el.style.top  = icon.y + 'px';
  el.dataset.dtId = icon.id;

  const thumb = _makeThumb(icon);
  const lbl = document.createElement('div');
  lbl.className = 'dt-label';
  lbl.textContent = icon.name.replace(/(\.[^.]+)$/, m => m.toLowerCase());

  const io = icon.iconOpts ?? {};
  if (io.labelPosition === 'above') {
    el.appendChild(lbl);
    el.appendChild(thumb);
  } else {
    el.appendChild(thumb);
    el.appendChild(lbl);
  }
  if (io.labelColor) lbl.style.color = io.labelColor;

  // CSS transforms on the icon container
  const transforms = [];
  if (io.rotation) transforms.push(`rotate(${io.rotation}deg)`);
  if (io.scale)    transforms.push(`scale(${io.scale})`);
  if (transforms.length) el.style.transform = transforms.join(' ');

  // Tint on thumbnail
  if (io.tint && thumb) thumb.style.filter = `hue-rotate(${io.tint}deg)`;

  // Animate
  if (io.animate) {
    const anim = { spin: 'ar-icon-spin 2s linear infinite', bounce: 'ar-icon-bounce 0.8s ease infinite', pulse: 'ar-icon-pulse 1s ease infinite' };
    el.style.animation = anim[io.animate] ?? io.animate;
    if (!document.getElementById('dt-anim-styles')) {
      const st = document.createElement('style');
      st.id = 'dt-anim-styles';
      st.textContent = `@keyframes ar-icon-spin{to{transform:rotate(360deg)}}@keyframes ar-icon-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes ar-icon-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`;
      document.head.appendChild(st);
    }
  }

  let _t = 0;
  el.addEventListener('click', e => {
    e.stopPropagation();
    const now = Date.now();
    if (now - _t < 380) { _activate(icon); _t = 0; }
    else { _sel(icon.id); _t = now; }
  });
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    _ctx(icon, e.clientX, e.clientY);
  });
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.contentEditable === 'true') return;
    e.stopPropagation();
    const ox = e.clientX - icon.x, oy = e.clientY - icon.y;
    let moved = false;
    // If dragging a selected icon, co-move all selected icons
    const isMulti = _selIds.has(icon.id) && _selIds.size > 1;
    const peers = isMulti
      ? [..._selIds].map(id => _icons.get(id)).filter(ic => ic && ic !== icon)
      : [];
    const peerOffsets = peers.map(ic => ({ ic, ox: e.clientX - ic.x, oy: e.clientY - ic.y }));
    const mv = e => {
      if (!moved) { moved = true; _trashShow(); }
      icon.x = Math.max(0, e.clientX - ox);
      icon.y = Math.max(0, e.clientY - oy);
      el.style.left = icon.x + 'px';
      el.style.top  = icon.y + 'px';
      for (const { ic, ox: pox, oy: poy } of peerOffsets) {
        ic.x = Math.max(0, e.clientX - pox);
        ic.y = Math.max(0, e.clientY - poy);
        if (ic.el) { ic.el.style.left = ic.x + 'px'; ic.el.style.top = ic.y + 'px'; }
      }
      if (_trashEl) _trashEl.classList.toggle('dt-trash-hover', _overTrash(e.clientX, e.clientY));
    };
    const up = e => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      _trashHide();
      if (moved && _overTrash(e.clientX, e.clientY)) {
        // Release into trash — delete icon(s)
        const toDelete = isMulti ? [..._selIds] : [icon.id];
        for (const id of toDelete) {
          const ic = _icons.get(id);
          if (ic && ic.type !== 'editor') { ic.el?.remove(); _icons.delete(id); _selIds.delete(id); }
        }
        _clearSel();
        _saveDesktopState();
      } else if (moved) {
        _saveDesktopStateDebounced();
      }
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
  return el;
}

// ── Selection ─────────────────────────────────────────────────────────────────

let _selIds = new Set();

function _clearSel() {
  _selIds.forEach(id => _icons.get(id)?.el?.classList.remove('dt-sel'));
  _selIds.clear();
}

function _sel(id) {
  _clearSel();
  if (id) { _selIds.add(id); _icons.get(id)?.el?.classList.add('dt-sel'); }
}

function _selMulti(ids) {
  _clearSel();
  for (const id of ids) { _selIds.add(id); _icons.get(id)?.el?.classList.add('dt-sel'); }
}

// ── Activate (double-click) ───────────────────────────────────────────────────

function _activate(icon) {
  if (icon.type === 'editor') {
    const win = document.getElementById(icon.winId);
    if (win) { win.style.display = 'flex'; _wm?.focus(icon.winId); }
    return;
  }
  if (icon.type === 'folder') {
    const fd = icon.folderData;
    if (fd.handle) window.wm.registerFolder(icon.id, fd.handle);
    else if (fd.fallback) window.wm.registerFolderFallback(icon.id, fd.fallback);
    window.wm.browse(icon.id, null, { x: icon.x + 80, y: icon.y }).catch(() => {});
    return;
  }
  if (!icon.url) return;
  const wmType = _WM[icon.type];
  if (wmType) {
    const winId = _wm?.spawn(icon.name.replace(/(\.[^.]+)$/, m => m.toLowerCase()), { type: wmType, src: icon.url, w: 560, h: 400 });
    if (winId && icon.el) {
      icon._wmWinId = winId;
      icon.el.classList.add('dt-active');
      const poll = setInterval(() => {
        const w = document.getElementById(winId);
        if (!w || w.style.display === 'none') { icon.el?.classList.remove('dt-active'); clearInterval(poll); }
      }, 600);
    }
    return;
  }
  if (icon.type === 'audio') { new Audio(icon.url).play().catch(() => {}); return; }
  if (icon.type === 'code') {
    fetch(icon.url).then(r => r.text()).then(code => {
      if (window.__ar_newEditorWithCode) window.__ar_newEditorWithCode(code);
    }).catch(() => {});
    return;
  }
  _wm?.spawn(icon.name, { type: 'html', html: `<div style="padding:16px;color:#ccc;">${icon.name}</div>`, w: 280, h: 160 });
}

// ── Context menu ──────────────────────────────────────────────────────────────

let _ctxEl = null;
function _dismissCtx() { _ctxEl?.remove(); _ctxEl = null; }

function _ctx(icon, cx, cy) {
  _dismissCtx();
  const menu = document.createElement('div');
  menu.className = 'dt-ctx';
  _ctxEl = menu;

  const item = (label, fn) => {
    const el = document.createElement('div');
    el.className = 'dt-ctx-item';
    el.textContent = label;
    el.addEventListener('mousedown', e => { e.stopPropagation(); _dismissCtx(); fn(); });
    menu.appendChild(el);
  };
  const sep = () => { const el = document.createElement('div'); el.className = 'dt-ctx-sep'; menu.appendChild(el); };
  const section = t => { const el = document.createElement('div'); el.className = 'dt-ctx-label'; el.textContent = t; menu.appendChild(el); };

  const startRename = () => {
    const lbl = icon.el?.querySelector('.dt-label');
    if (!lbl) return;
    lbl.contentEditable = 'true';
    lbl.style.pointerEvents = 'auto';
    setTimeout(() => {
      lbl.focus();
      const range = document.createRange(); range.selectNodeContents(lbl);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }, 0);
    const onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); lbl.blur(); }
      if (e.key === 'Escape') { lbl.textContent = icon.name; lbl.blur(); }
    };
    const finish = () => {
      lbl.contentEditable = 'false';
      lbl.style.pointerEvents = '';
      lbl.removeEventListener('keydown', onKey);
      const name = lbl.textContent.trim() || icon.name;
      icon.name = name; lbl.textContent = name;
      if (icon.type === 'editor') {
        document.getElementById(icon.winId)?._wmOnTitleChange?.(name);
      }
      _saveDesktopState();
    };
    lbl.addEventListener('blur', finish, { once: true });
    lbl.addEventListener('keydown', onKey);
  };

  const doDuplicate = () => {
    if (icon.type === 'editor') { duplicateEditor(icon.editorId); return; }
    const nx = icon.x + 20, ny = icon.y + 20;
    const dup = _addFileIcon(icon.name, '', icon.url, nx + 38, ny + 38, icon.content);
    dup.x = nx; dup.y = ny;
    if (dup.el) { dup.el.style.left = nx + 'px'; dup.el.style.top = ny + 'px'; }
  };

  if (icon.type === 'editor') {
    item('Open / Focus', () => _activate(icon));
    item('Rename', startRename);
    item('Duplicate', doDuplicate);
    sep();
  } else {
    item('Open', () => _activate(icon));
    item('Rename', startRename);
    item('Duplicate', doDuplicate);
    if (icon.url) item('Copy URL', () => navigator.clipboard?.writeText(icon.url).catch(() => {}));
    if ((icon.type === 'image' || icon.type === 'video') && icon.url) {
      sep(); section('Shader');
      item('Use as shader texture', () => {
        if (!window.Shader) return;
        if (icon.type === 'image') {
          const img = Object.assign(new Image(), { crossOrigin: 'anonymous', src: icon.url });
          img.addEventListener('load', () =>
            new window.Shader(({ uv, col }) => [col.r, col.g, col.b, col.a], { video: img }).start(), { once: true });
        } else {
          const v = Object.assign(document.createElement('video'), { src: icon.url, loop: true, muted: true });
          v.addEventListener('canplay', () => {
            v.play().catch(() => {});
            new window.Shader(({ uv, col }) => [col.r, col.g, col.b, col.a], { video: v }).start();
          }, { once: true });
        }
      });
    }
    if (icon.type === 'code' && icon.url) {
      sep(); section('Editor');
      item('Load into new editor', () => {
        fetch(icon.url).then(r => r.text()).then(code => {
          window.__ar_newEditorWithCode ? window.__ar_newEditorWithCode(code)
            : navigator.clipboard?.writeText(code);
        }).catch(() => {});
      });
    }
    sep();
  }

  item(icon.type === 'editor' ? 'Remove editor…' : 'Release', () => {
    if (icon.type === 'editor') {
      if (!confirm(`Remove "${icon.name}"? This removes the editor and its code permanently.`)) return;
      window.__ar_instances?.get(icon.editorId)?.destroy();
    } else {
      icon.el?.remove();
      _icons.delete(icon.id);
      _selIds.delete(icon.id);
      _saveDesktopState();
    }
  });

  const allSelected = [..._selIds].filter(id => _icons.has(id));
  if (allSelected.length > 1) {
    sep();
    item(`Release all ${allSelected.length} selected`, () => {
      for (const id of allSelected) {
        const ic = _icons.get(id);
        if (!ic) continue;
        if (ic.type === 'editor') {
          window.__ar_instances?.get(ic.editorId)?.destroy();
        } else {
          ic.el?.remove(); _icons.delete(id);
        }
      }
      _clearSel();
      _saveDesktopState();
    });
  }

  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(cx, window.innerWidth  - r.width  - 8) + 'px';
  menu.style.top  = Math.min(cy, window.innerHeight - r.height - 8) + 'px';

  setTimeout(() => {
    const dismiss = e => {
      if (!menu.contains(e.target)) { _dismissCtx(); document.removeEventListener('mousedown', dismiss, true); }
    };
    document.addEventListener('mousedown', dismiss, true);
  }, 0);
}

// ── Internal add ──────────────────────────────────────────────────────────────

function _addFileIcon(name, mime, url, dropX, dropY, content = null, iconOpts = null) {
  const type = _classify(name, mime);
  let x = Math.max(4, dropX - 38), y = Math.max(4, dropY - 38);
  for (const f of _icons.values()) {
    if (f.type !== 'editor' && Math.abs(f.x - x) < 80 && Math.abs(f.y - y) < 96) x += 88;
  }
  const id = 'dt-' + (_nextId++);
  const icon = { id, name, type, url, content, x, y, el: null, iconOpts };
  const el = _buildEl(icon);
  icon.el = el;
  _icons.set(id, icon);
  _desktop?.appendChild(el);
  for (const cb of _onFileCbs) { try { cb({ id, name, type, url, el }); } catch (_) {} }
  _saveDesktopState();
  return icon;
}

function _addFolderIcon(folderData, x = 20, y = 20) {
  const id = 'dt-' + (_nextId++);
  let ix = x, iy = y;
  for (const f of _icons.values()) {
    if (Math.abs(f.x - ix) < 80 && Math.abs(f.y - iy) < 96) ix += 88;
  }
  const icon = { id, name: folderData.name, type: 'folder', folderData, url: null, content: null, x: ix, y: iy, el: null };
  const el = _buildEl(icon);
  icon.el = el;
  _icons.set(id, icon);
  _desktop?.appendChild(el);
  return icon;
}

export function addFolderIcon(folderData, x = 20, y = 20) {
  const icon = _addFolderIcon(folderData, x, y);
  _saveDesktopState();
  return icon.id;
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

function _initDrop() {
  const d = _desktop;
  if (!d) return;

  _ensureTrash();

  d.addEventListener('dragenter', e => {
    if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); d.classList.add('dt-hover'); }
  });
  d.addEventListener('dragleave', e => { if (!d.contains(e.relatedTarget)) d.classList.remove('dt-hover'); });
  d.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  d.addEventListener('drop', e => {
    e.preventDefault();
    d.classList.remove('dt-hover');
    const rect = d.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    let offset = 0;
    for (const file of e.dataTransfer.files) {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) continue;
      const url = URL.createObjectURL(file);
      // Read content for small images and code files (for project serialization)
      const fref = file;
      const type = _classify(fref.name, fref.type);
      const icon = _addFileIcon(fref.name, fref.type, url, dx + offset, dy + offset);
      if (type === 'image' && fref.size < 2 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = ev => { icon.content = ev.target.result; _saveDesktopState(); };
        reader.readAsDataURL(fref);
      } else if (type === 'code') {
        const reader = new FileReader();
        reader.onload = ev => { icon.content = ev.target.result; _saveDesktopState(); };
        reader.readAsText(fref);
      }
      offset += 18;
    }
  });

  let _suppressClick = false;

  d.addEventListener('click', e => {
    if (_suppressClick) { _suppressClick = false; return; }
    if (e.target === d) { _clearSel(); _dismissCtx(); }
  });

  // Marquee selection
  d.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target !== d) return;
    const dRect = d.getBoundingClientRect();
    const x0 = e.clientX - dRect.left, y0 = e.clientY - dRect.top;
    let marquee = null, moved = false;

    const mv = e => {
      const x1 = e.clientX - dRect.left, y1 = e.clientY - dRect.top;
      if (!moved && Math.abs(x1 - x0) + Math.abs(y1 - y0) < 4) return;
      moved = true;
      if (!marquee) { marquee = document.createElement('div'); marquee.className = 'dt-marquee'; d.appendChild(marquee); }
      const left = Math.min(x0, x1), top = Math.min(y0, y1);
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      Object.assign(marquee.style, { left: left+'px', top: top+'px', width: w+'px', height: h+'px' });
      const hits = [];
      for (const icon of _icons.values()) {
        const ir = icon.el?.getBoundingClientRect(); if (!ir) continue;
        const ix = ir.left - dRect.left, iy = ir.top - dRect.top;
        if (ix < left + w && ix + ir.width > left && iy < top + h && iy + ir.height > top) hits.push(icon.id);
      }
      _selMulti(hits);
    };
    const up = () => {
      marquee?.remove(); marquee = null;
      if (moved) _suppressClick = true;
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
}

// ── Editor icon management (called by EditorInstance) ─────────────────────────

// Default cascade position for editors without a saved position.
function _defaultEditorPos(editorId) {
  return { x: 16, y: 16 + (editorId - 1) * 100 };
}

export function addEditorIcon(editorId, winId, label) {
  // Use saved position from project restore, or default cascade.
  const saved = _restoredPositions.get(editorId);
  _restoredPositions.delete(editorId);
  const { x, y } = saved ?? _defaultEditorPos(editorId);

  const id   = 'dt-editor-' + editorId;
  const icon = { id, name: label, type: 'editor', editorId, winId, url: null, content: null, x, y, el: null };
  const el   = _buildEl(icon);
  icon.el    = el;
  _icons.set(id, icon);
  _desktop?.appendChild(el);
  _saveDesktopState();
  return icon;
}

export function removeEditorIcon(editorId) {
  const id = 'dt-editor-' + editorId;
  const icon = _icons.get(id);
  if (!icon) return;
  icon.el?.remove();
  _icons.delete(id);
  _selIds.delete(id);
  _saveDesktopState();
}

export function updateEditorIconLabel(editorId, label) {
  const icon = _icons.get('dt-editor-' + editorId);
  if (!icon) return;
  icon.name = label;
  const lbl = icon.el?.querySelector('.dt-label');
  if (lbl) lbl.textContent = label;
  _saveDesktopState();
}

// ── Project serialization ─────────────────────────────────────────────────────

export function serializeDesktop() {
  const out = [];
  for (const icon of _icons.values()) {
    if (icon.type === 'folder') continue;
    if (icon.type === 'editor') {
      out.push({ type: 'editor', editorId: icon.editorId, name: icon.name, x: icon.x, y: icon.y });
    } else if (icon.content) {
      // content = data URL (images) or plain text (code)
      out.push({ type: icon.type, name: icon.name, content: icon.content, x: icon.x, y: icon.y });
    } else if (icon.url && !icon.url.startsWith('blob:')) {
      // HTTP URL — save directly
      out.push({ type: icon.type, name: icon.name, url: icon.url, x: icon.x, y: icon.y });
    }
    // blob URL without content = dropped file too large or not read yet — skip
  }
  return out;
}

export function restoreDesktop(icons = []) {
  // Remove all non-editor icons (editor icons are removed when editors are destroyed)
  for (const [id, icon] of _icons) {
    if (icon.type !== 'editor') { icon.el?.remove(); _icons.delete(id); }
  }
  _restoredPositions.clear();

  for (const saved of icons) {
    if (saved.type === 'editor') {
      // Store position — picked up by addEditorIcon when the editor is created
      _restoredPositions.set(saved.editorId, { x: saved.x, y: saved.y });
    } else if (saved.content) {
      let url, mime = '';
      if (saved.type === 'image') {
        url  = saved.content; // data URL is already the src
        mime = 'image/jpeg';
      } else if (saved.type === 'code') {
        const blob = new Blob([saved.content], { type: 'text/javascript' });
        url  = URL.createObjectURL(blob);
        mime = 'text/javascript';
      }
      if (url) {
        const icon = _addFileIcon(saved.name, mime, url, saved.x + 38, saved.y + 38, saved.content);
        icon.x = saved.x; icon.y = saved.y;
        if (icon.el) { icon.el.style.left = icon.x + 'px'; icon.el.style.top = icon.y + 'px'; }
      }
    } else if (saved.url) {
      const icon = _addFileIcon(saved.name, '', saved.url, saved.x + 38, saved.y + 38);
      icon.x = saved.x; icon.y = saved.y;
      if (icon.el) { icon.el.style.left = icon.x + 'px'; icon.el.style.top = icon.y + 'px'; }
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const DesktopAPI = {
  add(url, { name = 'file', type, x, y, rotation, tint, scale, animate, labelPosition, labelColor } = {}) {
    const iconOpts = (rotation != null || tint != null || scale != null || animate != null || labelPosition != null || labelColor != null)
      ? { rotation, tint, scale, animate, labelPosition, labelColor }
      : null;
    const icon = _addFileIcon(name, type ? '' : name, url, (x ?? 80) + 38, (y ?? 80) + 38, null, iconOpts);
    if (type) icon.type = type;
    return { id: icon.id, name: icon.name, type: icon.type, url: icon.url };
  },
  remove(id) {
    const icon = _icons.get(id);
    if (!icon) return;
    icon.el?.remove();
    _icons.delete(id);
    _selIds.delete(id);
    _saveDesktopState();
  },
  clear() {
    for (const icon of _icons.values()) { if (icon.type !== 'editor') { icon.el?.remove(); _icons.delete(icon.id); } }
    _clearSel();
    _saveDesktopState();
  },
  files() {
    return [..._icons.values()].map(({ id, name, type, url, x, y }) => ({ id, name, type, url, x, y }));
  },
  onFile(fn) { _onFileCbs.push(fn); },
  open(id)   { const icon = _icons.get(id); if (icon) _activate(icon); },
};

// ── Editor duplicate (shared with toolbar button) ─────────────────────────────

export function duplicateEditor(editorId) {
  const icon = _icons.get('dt-editor-' + editorId);
  const inst = window.__ar_instances?.get(editorId);
  const code = inst?.cm?.getValue() ?? '';
  const base = (inst?.title ?? icon?.name ?? 'Editor').replace(/ \(copy(?:\s+\d+)?\)$/, '');
  const newTitle = base + ' (copy)';
  const newInst = window.__ar_newEditorWithCode?.(code);
  if (!newInst) return;
  try { localStorage.setItem('vl-ide-title-' + newInst.id, newTitle); } catch (_) {}
  newInst.title = newTitle;
  const win = document.getElementById(newInst.editorWinId);
  if (win) {
    const t = win.querySelector('.wm-title'); if (t) t.textContent = newTitle;
    win.style.display = 'none';
  }
  updateEditorIconLabel(newInst.id, newTitle);
  const newIcon = _icons.get('dt-editor-' + newInst.id);
  if (newIcon && icon) {
    newIcon.x = icon.x + 20; newIcon.y = icon.y + 20;
    if (newIcon.el) { newIcon.el.style.left = newIcon.x + 'px'; newIcon.el.style.top = newIcon.y + 'px'; }
  }
}

// ── Cleanup (per-run) ─────────────────────────────────────────────────────────

export function cleanupDesktop() {
  _onFileCbs.length = 0;
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initDesktop(wmApi) {
  _wm      = wmApi;
  _desktop = document.getElementById('desktop');
  _injectCSS();
  try {
    const saved = localStorage.getItem(_DESKTOP_KEY);
    if (saved) restoreDesktop(JSON.parse(saved));
  } catch (_) {}
  _loadFolderIcons();
  _initDrop();

  document.addEventListener('keydown', e => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (_selIds.size === 0) return;
    const active = document.activeElement;
    if (active && active !== document.body && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable === true)) return;
    e.preventDefault();
    for (const id of [..._selIds]) {
      const icon = _icons.get(id);
      if (icon && icon.type !== 'editor') { icon.el?.remove(); _icons.delete(id); }
    }
    _clearSel();
    _saveDesktopState();
  });
}
