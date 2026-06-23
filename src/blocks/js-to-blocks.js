// Best-effort JS → Blockly workspace JSON translator.
// Parses user code with Esprima, pattern-matches known API calls, emits block JSON.
// Unrecognized statements are silently skipped.

import esprima from 'esprima';
import { SHADER_PRESETS, CAMERA_PRESETS } from '../api/shader.js';

function normalizeWGSL(s) { return s.trim().replace(/\s+/g, ' '); }

function matchExact(body, table) {
  const norm = normalizeWGSL(body);
  for (const [key, val] of Object.entries(table))
    if (normalizeWGSL(val) === norm) return key;
  return null;
}

// Fuzzy camera preset matching — tolerant of variable name differences
function matchCameraFuzzy(body) {
  if (/0\.299\s*,\s*0\.587/.test(body))         return 'greyscale';
  if (/1\.0\s*-\s*\w+\.rgb/.test(body))         return 'invert';
  if (/\.g,\s*\w+\.b,\s*\w+\.r/.test(body))     return 'channel_swap';
  if (/floor\s*\(\s*\w+\.rgb\s*\*/.test(body))  return 'posterize';
  if (/fract\s*\(\s*uv\.y/.test(body))           return 'scanlines';
  return null;
}

function matchCameraPreset(body) {
  return matchExact(body, CAMERA_PRESETS) ?? matchCameraFuzzy(body);
}

// ── AST helpers ──────────────────────────────────────────────────────────────

function strLit(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1)
    return node.quasis[0].value.cooked;
  return null;
}

function numLit(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const v = numLit(node.argument); return v != null ? -v : null;
  }
  return null;
}

function isMember(node, obj, prop) {
  if (!node || node.type !== 'MemberExpression') return false;
  return (obj === '*' || node.object?.name === obj) &&
         (prop === '*' || node.property?.name === prop);
}

function isCall(node, obj, method) {
  return node?.type === 'CallExpression' && isMember(node.callee, obj, method);
}

function isArVideo(node) {
  return node?.type === 'MemberExpression' &&
    node.object?.name === 'window' && node.property?.name === '__ar_video';
}

function callbackStatements(node) {
  const fn = node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression' ? node : null;
  return fn?.body?.type === 'BlockStatement' ? fn.body.body : null;
}

// Wrap a creator block in "start shader [creator]"
function makeStartShader(creatorBlock) {
  if (!creatorBlock) return null;
  return { type: 'shader_start', inputs: { SHADER: { block: creatorBlock } } };
}

// ── Shader new-expression → block ────────────────────────────────────────────

function matchShaderNew(newExpr) {
  const body = strLit(newExpr.arguments[0]);
  if (!body) return null;

  const opts = newExpr.arguments[1];
  let videoNode = null;
  if (opts?.type === 'ObjectExpression') {
    for (const p of opts.properties)
      if (p.key?.name === 'video') { videoNode = p.value; break; }
  }

  if (videoNode && isArVideo(videoNode)) {
    const effect = matchCameraPreset(body) ?? 'greyscale';
    return { type: 'shader_camera_effect', fields: { EFFECT: effect } };
  }

  const preset = matchExact(body, SHADER_PRESETS);
  return preset ? { type: 'shader_preset', fields: { PRESET: preset } } : null;
}

// ── Value block matcher ──────────────────────────────────────────────────────

const SYNTH_TYPES = ['synth', 'poly', 'fm', 'am', 'pluck', 'kick', 'metal', 'noise'];

function matchValue(node, vars) {
  if (!node) return null;

  for (const t of SYNTH_TYPES)
    if (isCall(node, 'audio', t)) return { type: 'audio_create_synth', fields: { TYPE: t } };

  if (isCall(node, 'audio', 'reverb'))
    return { type: 'audio_reverb', fields: { DEC: numLit(node.arguments[0]) ?? 2 } };
  if (isCall(node, 'audio', 'delay'))
    return { type: 'audio_delay', fields: { TIME: numLit(node.arguments[0]) ?? 0.25, FB: numLit(node.arguments[1]) ?? 0.5 } };
  if (isCall(node, 'audio', 'distort'))
    return { type: 'audio_distort', fields: { AMT: numLit(node.arguments[0]) ?? 0.8 } };
  if (isCall(node, 'Media', 'video'))
    return { type: 'media_video', fields: { URL: strLit(node.arguments[0]) ?? '' } };
  if (isCall(node, 'Media', 'imageLayer'))
    return { type: 'media_image_layer', fields: { URL: strLit(node.arguments[0]) ?? '' } };

  // Resolve identifier via variable map
  const name = node?.name;
  if (name && vars?.has(name)) return vars.get(name).valueBlock ?? null;

  return null;
}

// ── Statement translator ─────────────────────────────────────────────────────

function translateOne(node, vars) {
  // VariableDeclarations are pre-processed in translateStatements; skip here
  if (node?.type === 'VariableDeclaration') return null;

  const expr = node?.type === 'ExpressionStatement' ? node.expression : node;
  if (!expr || expr.type !== 'CallExpression') return null;

  // ── draw.* ──
  if (isCall(expr, 'draw', 'bg'))    return { type: 'draw_bg',     fields: { COLOR: strLit(expr.arguments[0]) ?? '#000' } };
  if (isCall(expr, 'draw', 'clear')) return { type: 'canvas_clear', fields: {} };
  if (isCall(expr, 'draw', 'alpha')) return { type: 'draw_alpha',  fields: { ALPHA: numLit(expr.arguments[0]) ?? 1 } };
  if (isCall(expr, 'draw', 'reset')) return { type: 'draw_reset',  fields: {} };

  if (isCall(expr, 'draw', 'rect')) {
    const [x, y, w, h] = expr.arguments.slice(0, 4).map(numLit);
    if (x != null) return { type: 'canvas_fill_rect', fields: { X: x, Y: y ?? 0, W: w ?? 100, H: h ?? 100, COLOR: strLit(expr.arguments[4]) ?? 'white' } };
  }
  if (isCall(expr, 'draw', 'circle')) {
    const [x, y, r] = expr.arguments.slice(0, 3).map(numLit);
    if (x != null) return { type: 'canvas_fill_circle', fields: { X: x, Y: y ?? 0, R: r ?? 50, COLOR: strLit(expr.arguments[3]) ?? 'white' } };
  }
  if (isCall(expr, 'draw', 'line')) {
    const [x1, y1, x2, y2] = expr.arguments.slice(0, 4).map(numLit);
    if (x1 != null) return { type: 'draw_line', fields: { X1: x1, Y1: y1 ?? 0, X2: x2 ?? 400, Y2: y2 ?? 400, COLOR: strLit(expr.arguments[4]) ?? 'white', THICKNESS: numLit(expr.arguments[5]) ?? 1 } };
  }
  if (isCall(expr, 'draw', 'text')) {
    const str = strLit(expr.arguments[0]);
    const [x, y, size] = expr.arguments.slice(1, 4).map(numLit);
    return { type: 'draw_text', fields: { STR: str ?? '', X: x ?? 0, Y: y ?? 0, SIZE: size ?? 24, COLOR: strLit(expr.arguments[4]) ?? 'white' } };
  }

  // ── getLayer(z).blur/opacity ──
  const { callee } = expr;
  if (isMember(callee, '*', 'blur') && callee.object?.type === 'CallExpression' && callee.object.callee?.name === 'getLayer')
    return { type: 'canvas_blur', fields: { Z: numLit(callee.object.arguments[0]) ?? 0, AMT: numLit(expr.arguments[0]) ?? 5 } };
  if (isMember(callee, '*', 'opacity') && callee.object?.type === 'CallExpression' && callee.object.callee?.name === 'getLayer')
    return { type: 'canvas_layer_opacity', fields: { Z: numLit(callee.object.arguments[0]) ?? 0, OPACITY: numLit(expr.arguments[0]) ?? 0.5 } };

  // ── ShaderFX.* — both shorthand (camera/preset/video) and factory (cameraShader/presetShader/videoShader) ──
  // Shorthand (create+start): appear as top-level expression statements
  if (isCall(expr, 'ShaderFX', 'camera')) {
    const effect = strLit(expr.arguments[0]) ?? 'greyscale';
    return makeStartShader({ type: 'shader_camera_effect', fields: { EFFECT: effect } });
  }
  if (isCall(expr, 'ShaderFX', 'preset')) {
    return makeStartShader({ type: 'shader_preset', fields: { PRESET: strLit(expr.arguments[0]) ?? 'gradient' } });
  }
  if (isCall(expr, 'ShaderFX', 'video')) {
    const effect = strLit(expr.arguments[1]) ?? 'greyscale';
    const vidBlock = matchValue(expr.arguments[0], vars);
    const creator = { type: 'shader_video_effect', fields: { EFFECT: effect } };
    if (vidBlock) creator.inputs = { VIDEO: { block: vidBlock } };
    return makeStartShader(creator);
  }

  // ── Shader: (new Shader(...)).start() or (ShaderFX.cameraShader(...)).start() or s.start() ──
  if (isMember(callee, '*', 'start')) {
    const obj = callee.object;
    if (obj?.type === 'NewExpression' && obj.callee?.name === 'Shader')
      return makeStartShader(matchShaderNew(obj));
    // ShaderFX factory methods called inline: (ShaderFX.cameraShader(...)).start()
    if (isCall(obj, 'ShaderFX', 'cameraShader'))
      return makeStartShader({ type: 'shader_camera_effect', fields: { EFFECT: strLit(obj.arguments[0]) ?? 'greyscale' } });
    if (isCall(obj, 'ShaderFX', 'presetShader'))
      return makeStartShader({ type: 'shader_preset', fields: { PRESET: strLit(obj.arguments[0]) ?? 'gradient' } });
    if (isCall(obj, 'ShaderFX', 'videoShader')) {
      const effect = strLit(obj.arguments[1]) ?? 'greyscale';
      const vidBlock = matchValue(obj.arguments[0], vars);
      const creator = { type: 'shader_video_effect', fields: { EFFECT: effect } };
      if (vidBlock) creator.inputs = { VIDEO: { block: vidBlock } };
      return makeStartShader(creator);
    }
    const entry = vars?.get(obj?.name);
    if (entry?.shaderNew) return makeStartShader(matchShaderNew(entry.shaderNew));
    if (entry?.shaderFXBlock) return makeStartShader(entry.shaderFXBlock);
  }

  // ── setInterval / setTimeout ──
  const fnName = callee?.name;
  if (fnName === 'setInterval' || fnName === 'setTimeout') {
    const ms = numLit(expr.arguments[1]) ?? (fnName === 'setInterval' ? 100 : 1000);
    const body = callbackStatements(expr.arguments[0]);
    const inner = body ? translateStatements(body) : null;
    const block = { type: fnName === 'setInterval' ? 'ctrl_interval' : 'ctrl_timeout', fields: { MS: ms } };
    if (inner) block.inputs = { DO: { block: inner } };
    return block;
  }

  // ── onKey ──
  if (fnName === 'onKey') {
    const key = strLit(expr.arguments[0]) ?? 'any';
    const body = callbackStatements(expr.arguments[1]);
    const inner = body ? translateStatements(body) : null;
    const block = { type: 'ctrl_onkey', fields: { KEY: key } };
    if (inner) block.inputs = { DO: { block: inner } };
    return block;
  }

  // ── audio ──
  if (isCall(expr, 'audio', 'bpm'))    return { type: 'audio_bpm',            fields: { BPM: numLit(expr.arguments[0]) ?? 120 } };
  if (isCall(expr, 'audio', 'start'))  return { type: 'audio_transport_start', fields: {} };
  if (isCall(expr, 'audio', 'volume')) return { type: 'audio_volume',          fields: { DB:  numLit(expr.arguments[0]) ?? -6 } };

  // (synth).play(note, dur) — note+dur distinguish from vid.play()
  if (isMember(callee, '*', 'play')) {
    const note = strLit(expr.arguments[0]);
    const dur  = strLit(expr.arguments[1]);
    if (note && dur) {
      const synthBlock = matchValue(callee.object, vars);
      const block = { type: 'audio_play', fields: { NOTE: note, DUR: dur } };
      if (synthBlock) block.inputs = { SYNTH: { block: synthBlock } };
      return block;
    }
  }

  // (from).connect(to)
  if (isMember(callee, '*', 'connect')) {
    const fromBlock = matchValue(callee.object, vars);
    const toBlock   = matchValue(expr.arguments[0], vars);
    if (fromBlock && toBlock) return { type: 'audio_connect', inputs: { FROM: { block: fromBlock }, TO: { block: toBlock } } };
  }

  // ── vision ──
  if (isCall(expr, 'vision', 'onGesture')) {
    const gest  = strLit(expr.arguments[0]) ?? 'Thumb_Up';
    const body  = callbackStatements(expr.arguments[1]);
    const inner = body ? translateStatements(body) : null;
    const block = { type: 'vision_on_gesture', fields: { GESTURE: gest } };
    if (inner) block.inputs = { DO: { block: inner } };
    return block;
  }
  if (isCall(expr, 'vision', 'onExpression')) {
    const name  = strLit(expr.arguments[0]) ?? 'smile';
    const body  = callbackStatements(expr.arguments[1]);
    const inner = body ? translateStatements(body) : null;
    const block = { type: 'vision_on_expression', fields: { EXPR: name } };
    if (inner) block.inputs = { DO: { block: inner } };
    return block;
  }

  // ── media ──
  if (isMember(callee, '*', 'play')) {
    const vidBlock = matchValue(callee.object, vars);
    if (vidBlock) return { type: 'media_video_play', inputs: { VIDEO: { block: vidBlock } } };
  }
  if (isMember(callee, '*', 'stop')) {
    const vidBlock = matchValue(callee.object, vars);
    if (vidBlock) return { type: 'media_video_stop', inputs: { VIDEO: { block: vidBlock } } };
  }

  return null;
}

function translateStatements(stmts) {
  // First pass: collect variable bindings for 2-step patterns (const x = expr; x.method())
  const vars = new Map();
  for (const s of stmts) {
    if (s.type !== 'VariableDeclaration') continue;
    for (const d of s.declarations) {
      const name = d.id?.name;
      if (!name || !d.init) continue;
      const init = d.init;
      if (init.type === 'NewExpression' && init.callee?.name === 'Shader') {
        vars.set(name, { shaderNew: init });
      } else if (isCall(init, 'ShaderFX', 'cameraShader')) {
        vars.set(name, { shaderFXBlock: { type: 'shader_camera_effect', fields: { EFFECT: strLit(init.arguments[0]) ?? 'greyscale' } } });
      } else if (isCall(init, 'ShaderFX', 'presetShader')) {
        vars.set(name, { shaderFXBlock: { type: 'shader_preset', fields: { PRESET: strLit(init.arguments[0]) ?? 'gradient' } } });
      } else if (isCall(init, 'ShaderFX', 'videoShader')) {
        const effect = strLit(init.arguments[1]) ?? 'greyscale';
        const vidBlock = matchValue(init.arguments[0], vars);
        const creator = { type: 'shader_video_effect', fields: { EFFECT: effect } };
        if (vidBlock) creator.inputs = { VIDEO: { block: vidBlock } };
        vars.set(name, { shaderFXBlock: creator });
      } else {
        const vb = matchValue(init, vars);
        if (vb) vars.set(name, { valueBlock: vb });
      }
    }
  }

  // Second pass: translate to blocks, skip nulls
  const blocks = [];
  for (const s of stmts) {
    const b = translateOne(s, vars);
    if (b) blocks.push(b);
  }

  if (!blocks.length) return null;

  // Link statement sequence via `next`
  for (let i = 0; i < blocks.length - 1; i++)
    blocks[i].next = { block: blocks[i + 1] };

  return blocks[0];
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert JavaScript source to Blockly workspace JSON.
 * Returns null if nothing could be translated.
 * Unrecognized code is silently skipped.
 */
export function jsToBlocks(code) {
  let ast;
  try {
    ast = esprima.parseScript(code, { tolerant: true });
  } catch {
    return null;
  }

  const root = translateStatements(ast.body);
  if (!root) return null;

  root.x = 20;
  root.y = 20;

  return { blocks: { languageVersion: 0, blocks: [root] } };
}
