# ADR 018 — Desktop Icon Customization: Full iconOpts Schema + Mutation API

**Status**: Implemented  
**Date**: 2026-06-26

---

## Context

`desktop.add(url, opts)` already supports six visual options (`rotation`, `scale`, `tint`, `animate`, `labelPosition`, `labelColor`) wired through an `iconOpts` object into `_buildEl`. However:

1. **`iconOpts` is never serialized.** `serializeDesktop()` writes `{ type, name, content, x, y }` only. Every visual customization — rotation, color, animation — is lost on page reload. This is a bug.

2. **No mutation API.** There is no `desktop.update(id, opts)`, `desktop.move(id, x, y)`, or `desktop.get(id)`. Once an icon is placed, it cannot be changed programmatically.

3. **No per-icon click handler.** `desktop.onFile(fn)` is a global callback for all icons. There is no `desktop.onClick(id, fn)` for per-icon reaction.

4. **Schema gaps.** Missing: custom glyph emoji, glyph background/color, label font size/family, badge overlay, tooltip. These are all naturally expressible as `iconOpts` properties.

5. **`addBlob()` ignores iconOpts.** Capture icons (webcam photos, recordings) cannot be customized.

---

## Decisions

### 1. `iconOpts` schema — full set

```js
{
  // Container transforms
  rotation:      Number,   // CSS rotate(Ndeg) on icon container
  scale:         Number,   // CSS scale(N) on icon container
  animate:       String,   // 'spin'|'bounce'|'pulse'|any CSS animation string

  // Thumbnail / glyph
  tint:          Number,   // hue-rotate(Ndeg) filter — only when showing image/video thumb
  glyph:         String,   // custom emoji or text — overrides ALL thumbnail types (ADR decision)
  glyphBg:       String,   // CSS color — glyph box background (overrides type-specific class)
  glyphColor:    String,   // CSS color — glyph text/icon color

  // Label
  labelPosition: String,   // 'above'|'below' (default: below)
  labelColor:    String,   // CSS color
  labelSize:     Number,   // font-size in px (default: 10)
  labelFont:     String,   // font-family string

  // Overlay
  badge:         String,   // short text overlaid top-right ('3', '!', '★')
  badgeColor:    String,   // badge background CSS color (default: #e53935)

  // Meta
  tooltip:       String,   // title attribute on the icon container
}
```

### 2. `glyph` overrides ALL thumbnail types

If `glyph` is set, the icon always shows the glyph — even for `type:'image'` or `type:'video'`. The user explicitly wants a custom symbol, and hiding the thumbnail is the intended behavior. This is simpler than "glyph only for non-image/video" (one rule, no exceptions).

Consequence: if you want an image thumbnail, do not set `glyph`. If you want a custom icon for an image file, set `glyph`.

### 3. `iconOpts` added to serialization

`serializeDesktop()` now includes `iconOpts` for all non-editor icon types:

```js
out.push({ type, name, content, x, y, iconOpts: icon.iconOpts ?? undefined });
```

`restoreDesktop()` passes `saved.iconOpts ?? null` to `_addFileIcon()` in every branch. Old project files (no `iconOpts` field) load fine — `undefined ?? null` = `null` = no opts, existing behavior preserved. **Backwards compatible.**

### 4. Re-render strategy: full DOM replacement

`desktop.update(id, opts)` merges new opts into `icon.iconOpts`, then replaces `icon.el` with a fresh `_buildEl(icon)` call. The old element is removed; the new one inserted at the same DOM position.

Rationale: in-place patching would require 15+ individual property assignments for a complete implementation, each needing its own nullability check and undo path. Full re-render is a single call site that is always correct. The only transient state lost is the `.dt-active` class (shown when the wm window launched from this icon is open) — acceptable because this class re-applies the next time that window is launched, and it is ephemeral by nature.

A `_rerenderIcon(icon)` helper handles the swap, preserving `.dt-sel` selection state.

### 5. Run-scoped `onClick` handlers

`desktop.onClick(id, fn)` registers a per-icon callback in a module-level `_iconClickHandlers` Map. Handlers are cleared in `cleanupDesktop()` on every reset, consistent with `onFile` and all bus subscriptions. This is intentional: code that registers `onClick` in a run also clears with the run.

The `notify('desktop:icon-clicked', ...)` call in `_activate()` already fires before per-icon handlers — both paths fire on double-click.

### 6. `addBlob()` passes iconOpts through

`desktop.addBlob(blob, opts)` now accepts the same visual opts as `desktop.add()`. The `iconOpts` object is built the same way and passed to `_addFileIcon()`. Capture icons (webcam photos, recordings) can now be styled.

---

## New public API

```js
// Existing — expanded opts:
desktop.add(url, {
  name, type, content, x, y,
  // All iconOpts schema keys now accepted
  glyph, glyphBg, glyphColor,
  labelSize, labelFont,
  badge, badgeColor,
  tooltip,
  // Existing:
  rotation, scale, tint, animate, labelPosition, labelColor,
});

// New:
desktop.update(id, opts);   // merge opts, full re-render
desktop.move(id, x, y);     // reposition without re-render
desktop.get(id);            // → { id, name, type, url, x, y, iconOpts } | null
desktop.onClick(id, fn);    // per-icon callback, run-scoped
```

---

## Implementation

### `desktop-files.js` changes

1. **CSS** — add `.dt-badge` rule (position absolute, top-right, small red circle)
2. **`_makeThumb(icon)`** — check `iconOpts.glyph` FIRST (before image/video type check); apply `glyphBg`, `glyphColor` to the glyph div
3. **`_buildEl(icon)`** — add `labelSize`, `labelFont`, `badge`/`badgeColor`, `tooltip`
4. **`_rerenderIcon(icon)`** — new helper: swap icon.el in DOM, preserve `.dt-sel`
5. **`_iconClickHandlers`** — new Map; `_activate()` calls per-icon handlers; `cleanupDesktop()` clears it
6. **`serializeDesktop()`** — include `iconOpts` in output for all non-editor icons
7. **`restoreDesktop()`** — pass `saved.iconOpts ?? null` in all 8+ `_addFileIcon` call sites
8. **`DesktopAPI.add()`** — expand destructured opts to include new keys
9. **`DesktopAPI.addBlob()`** — accept and pass iconOpts
10. **`DesktopAPI.update(id, opts)`** — new method
11. **`DesktopAPI.move(id, x, y)`** — new method
12. **`DesktopAPI.get(id)`** — new method
13. **`DesktopAPI.onClick(id, fn)`** — new method

### Other files

- `src/editor/completions.js` — update Desktop category with new opts + methods
- `API.md` — update `desktop.add` signature + new methods
- `docs/desktop.md` — full opts table update

### Tests

- Extend `tests/capture.test.js` (already tests `desktop.addBlob`) for iconOpts pass-through
- New cases in existing desktop test coverage: `update()`, `move()`, `get()`, serialization round-trip with iconOpts

---

## Consequences

**Project file format change** — `iconOpts` now appears in `.vljson` `desktop` arrays. Field is optional; old loaders ignore unknown fields. New projects on old loaders: `iconOpts` is silently dropped → visual customizations lost on that machine, but no error.

**No breaking changes** — all new opts are optional. Existing `desktop.add()` calls work unchanged. `iconOpts` field absence in old projects treated as `null`.

**Glyph wins over thumbnails** — this is a mild behavior change for code using `type:'image'` with `glyph`. Since `glyph` is new, no existing code is affected.
