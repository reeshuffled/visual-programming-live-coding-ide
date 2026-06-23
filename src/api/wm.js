// Window manager: draggable/resizable floating windows + named tiling layouts.
// All layout coords are 0–1 fractions of desktop size, resolved to px at apply time.

// win-camera and win-mic are toggle-controlled (shown by camera.js / mic.js).
// win-console is output-controlled (shown by app.js when there's content).
// Layouts only position the tiled windows; floating windows manage themselves.

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
    name.textContent = entry.name;
    name.style.color = '#222';
    row.appendChild(spacer); row.appendChild(icon); row.appendChild(name);
    li.appendChild(row);

    row.addEventListener('click', async () => {
      const file = await entry.getFile();
      const url = URL.createObjectURL(file);
      onSelect?.(url, entry.name, entry);
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
    name.textContent = file.name;
    name.style.color = '#222';
    row.appendChild(icon);
    row.appendChild(name);
    row.addEventListener('click', () => {
      const url = URL.createObjectURL(file);
      onSelect?.(url, file.name, null);
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

const LAYOUTS = {
  split: {
    'win-toolkit':  { x: 0,    y: 0, w: 0.13, h: 1,    show: true },
    'win-editor-1': { x: 0.13, y: 0, w: 0.87, h: 1,    show: true },
    'win-canvas-1': { show: false },
  },
};

export function initWM(onContentResize) {
  const desktop = document.getElementById('desktop');
  let zTop = 100;
  let currentLayout = 'split';
  const savedGeometry = new Map();
  const spawnedIds = new Set();
  const fileHandles = new Map();
  const _builtinFactories = new Map();
  let spawnCounter = 0;

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

    const audioCtrl = tb.querySelector('.wm-audio-ctrl');
    tb.insertBefore(playBtn, audioCtrl);
  }

  function getWin(id) { return document.getElementById(id); }

  function applyLayout(name) {
    const layout = LAYOUTS[name];
    if (!layout) return;
    currentLayout = name;
    const dw = desktop.offsetWidth;
    const dh = desktop.offsetHeight;

    for (const [id, cfg] of Object.entries(layout)) {
      let win = document.getElementById(id);
      if (!win) {
        const factory = _builtinFactories.get(id);
        if (factory) factory();
        win = document.getElementById(id);
      }
      if (!win) continue;
      if (!cfg.show) { win.style.display = 'none'; continue; }
      win.style.display = 'flex';
      win.style.left   = `${Math.round(cfg.x * dw)}px`;
      win.style.top    = `${Math.round(cfg.y * dh)}px`;
      win.style.width  = `${Math.round(cfg.w * dw)}px`;
      win.style.height = `${Math.round(cfg.h * dh)}px`;
      win.style.zIndex = String(zTop++);
    }

    document.querySelectorAll('[data-layout]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.layout === name)
    );
    requestAnimationFrame(() => onContentResize?.());
  }

  function bringToFront(win) {
    win.style.zIndex = String(zTop++);
  }

  // Drag via titlebar
  desktop.addEventListener('mousedown', e => {
    const tb = e.target.closest('.wm-titlebar');
    if (!tb || e.target.closest('.wm-btn')) return;
    if (e.target.closest('[contenteditable="true"]')) return;
    const win = tb.closest('.wm-win');
    bringToFront(win);
    const ox = e.clientX - win.offsetLeft;
    const oy = e.clientY - win.offsetTop;
    const onMove = e => {
      const dw = desktop.offsetWidth, dh = desktop.offsetHeight;
      win.style.left = `${Math.max(0, Math.min(dw - 80,  e.clientX - ox))}px`;
      win.style.top  = `${Math.max(0, Math.min(dh - 28,  e.clientY - oy))}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onContentResize?.();
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
    const onMove = e => {
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
      onContentResize?.();
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
    if (win) _minimizeToTaskbar(win);
  });

  // Close button — supports custom _wmOnClose handler (e.g. editor confirmation)
  desktop.addEventListener('click', e => {
    if (!e.target.classList.contains('wm-close')) return;
    const win = e.target.closest('.wm-win');
    if (win._wmOnClose) {
      win._wmOnClose(); // handler responsible for removal
      return;
    }
    if (spawnedIds.has(win.id)) {
      win._wmCleanup?.();
      win._wmRescueContent?.();
      _disposeChannel(win.id);
      win.remove();
      spawnedIds.delete(win.id);
    } else {
      win.style.display = 'none';
    }
  });

  // Maximize / restore button
  desktop.addEventListener('click', e => {
    const btn = e.target.closest('.wm-max');
    if (!btn) return;
    const win = btn.closest('.wm-win');
    _toggleMaximize(win, btn);
    onContentResize?.();
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

  // Rename: double-click title label
  desktop.addEventListener('dblclick', e => {
    const title = e.target.closest('.wm-title');
    if (!title) return;
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
    };
    const onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { title.textContent = original; commit(); }
    };
    title.addEventListener('blur', commit);
    title.addEventListener('keydown', onKey);
  });

  // Nav layout buttons
  document.querySelectorAll('[data-layout]').forEach(btn =>
    btn.addEventListener('click', () => applyLayout(btn.dataset.layout))
  );

  // Hotkeys
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '1') { e.preventDefault(); applyLayout('split'); }
  });

  // Re-tile on browser resize
  window.addEventListener('resize', () => applyLayout(currentLayout));

  // Pre-existing built-in windows have no audio output — no controls needed.

  // ── Audio visualizer window builder ───────────────────────────────────────

  function _buildVizWindow(win, body) {
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

    sourceSelect.addEventListener('mousedown', refreshSources);
    sourceSelect.addEventListener('change', () => {
      connect(sourceSelect.value);
    });
    styleSelect.addEventListener('change', () => {
      if (toneAn) toneAn.type = styleSelect.value === 'wave' ? 'waveform' : 'fft';
    });

    refreshSources();
    styleSelect.value = 'wave';
    connect('master');
    frame();

    win._wmCleanup = () => { cancelAnimationFrame(rafId); disconnect(); };
  }

  // ── Public API (exposed as window.wm) ────────────────────────────────────

  const api = {
    /** Show a window by id */
    show(id) {
      const win = getWin(id);
      if (!win) return;
      win.style.display = 'flex';
      bringToFront(win);
    },

    /** Hide a window by id (built-ins hidden, spawned windows removed) */
    hide(id) {
      const win = getWin(id);
      if (!win) return;
      if (spawnedIds.has(id)) {
        win._wmCleanup?.();
        win.remove();
        spawnedIds.delete(id);
      } else {
        win.style.display = 'none';
      }
    },

    /** Alias for hide */
    close(id) { api.hide(id); },

    /** Toggle visibility */
    toggle(id) {
      const win = getWin(id);
      if (!win) return;
      if (win.style.display === 'none') api.show(id); else api.hide(id);
    },

    /** Bring window to front */
    focus(id) {
      const win = getWin(id);
      if (win) bringToFront(win);
    },

    /** Move window to pixel coords */
    move(id, x, y) {
      const win = getWin(id);
      if (!win) return;
      win.style.left = `${x}px`;
      win.style.top  = `${y}px`;
    },

    /** Resize window in pixels */
    resize(id, w, h) {
      const win = getWin(id);
      if (!win) return;
      win.style.width  = `${Math.max(180, w)}px`;
      win.style.height = `${Math.max(80,  h)}px`;
      onContentResize?.();
    },

    /** Maximize a window */
    maximize(id) {
      const win = getWin(id);
      if (!win || win.classList.contains('wm-maximized')) return;
      _toggleMaximize(win);
      onContentResize?.();
    },

    /** Restore a maximized window */
    restore(id) {
      const win = getWin(id);
      if (!win || !win.classList.contains('wm-maximized')) return;
      _toggleMaximize(win);
      onContentResize?.();
    },

    /** Switch to a named layout */
    layout(name) { applyLayout(name); },

    /** Return the current layout name */
    getLayout() { return currentLayout; },

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
          <span class="wm-btn wm-dup" title="Duplicate"><i class="fa-regular fa-copy"></i></span>
          <span class="wm-btn wm-min" title="Minimize">─</span>
          <span class="wm-btn wm-max" title="Maximize"><i class="fa-regular fa-window-maximize"></i></span>
          <span class="wm-btn wm-close" title="Close">×</span>
        </div>
        <div class="wm-body" style="overflow:auto;position:relative;"></div>
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
          const maxW = desk ? desk.offsetWidth * 0.9 : vid.videoWidth;
          const maxH = desk ? desk.offsetHeight * 0.9 : vid.videoHeight;
          const scale = Math.min(1, maxW / vid.videoWidth, (maxH - chrome) / vid.videoHeight);
          win.style.width  = `${Math.round(vid.videoWidth  * scale)}px`;
          win.style.height = `${Math.round(vid.videoHeight * scale + chrome)}px`;
        }, { once: true });
        _cleanup = () => { vid.pause(); vid.src = ''; };
      } else if (type === 'viz') {
        _buildVizWindow(win, body);
      } else if (type === 'camera' || type === 'canvas' || type === 'shader') {
        let src;
        if (type === 'camera') {
          src = document.getElementById('camera');
        } else if (type === 'canvas') {
          src = window.__ar_layers?.get(opts.z ?? 0);
        } else {
          src = opts.shader?.canvas;
        }
        if (src) {
          const dst = document.createElement('canvas');
          dst.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
          body.style.overflow = 'hidden';
          body.style.background = '#000';
          body.appendChild(dst);
          const ctx = dst.getContext('2d');
          let rafId;
          const copy = () => {
            if (src.width && src.height) {
              dst.width = src.width;
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

      if (type === 'video' || type === 'html') {
        const videoEl = type === 'video' ? body.querySelector('video') : null;
        _addAudioControls(win, videoEl);
        if (videoEl) _addVideoControls(win, videoEl);
      }

      desktop.appendChild(win);
      spawnedIds.add(id);
      bringToFront(win);
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

      // Only prompt when we have nothing cached yet
      if (!handles.length && !fallback) {
        if (window.showDirectoryPicker) {
          try {
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
        type: 'html', html: '',
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
      }

      addBtn.addEventListener('click', async () => {
        if (window.showDirectoryPicker) {
          try {
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

    /** Register a factory fn that (re)creates a built-in window by id */
    registerBuiltin(id, factory) { _builtinFactories.set(id, factory); },

    /** Create (or recreate) a built-in window by id */
    createBuiltin(id) { _builtinFactories.get(id)?.(); },

    LAYOUTS,
    applyLayout,
  };

  return api;
}
