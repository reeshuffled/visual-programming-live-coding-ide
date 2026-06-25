import { friendlyError, addInfiniteLoopProtection, extractScriptLine } from '../src/editor/live-patch.js';

// ── friendlyError ────────────────────────────────────────────────────────────

describe('friendlyError', () => {
  test('formats duplicate identifier error', () => {
    const msg = friendlyError(new Error("Identifier 'myVar' has already been declared"));
    expect(msg).toContain('myVar');
    expect(msg).toContain('declared twice');
  });

  test('formats not-a-function error', () => {
    const msg = friendlyError(new Error("'audio.synth' is not a function"));
    expect(msg).toContain('is not a function');
  });

  test('formats not-defined error', () => {
    const msg = friendlyError(new Error("myVar is not defined"));
    expect(msg).toContain('myVar');
    expect(msg).toContain('not defined');
  });

  test('formats cannot-read-property error with property name', () => {
    const msg = friendlyError(new Error("Cannot read properties of undefined (reading 'start')"));
    expect(msg).toContain('.start');
  });

  test('formats cannot-read-property error without property name', () => {
    const msg = friendlyError(new Error("Cannot read property of null"));
    expect(msg).toContain("doesn't exist yet");
  });

  test('formats unexpected token as syntax error', () => {
    const msg = friendlyError(new Error("Unexpected token '}'"));
    expect(msg).toContain('Syntax error');
  });

  test('formats unexpected identifier as syntax error', () => {
    const msg = friendlyError(new Error("Unexpected identifier 'foo'"));
    expect(msg).toContain('Syntax error');
  });

  test('passes infinite loop message through unchanged', () => {
    const raw = "Infinite loop detected. Please make changes and press Execute Program when you are ready to try again.";
    expect(friendlyError(new Error(raw))).toBe(raw);
  });

  test('strips TypeError prefix from unrecognised errors', () => {
    const msg = friendlyError(new Error("TypeError: something unexpected"));
    expect(msg).not.toMatch(/^TypeError:/);
    expect(msg).toContain('something unexpected');
  });

  test('accepts a plain string (not Error object)', () => {
    const msg = friendlyError("myFunc is not defined");
    expect(msg).toContain('myFunc');
  });
});

// ── addInfiniteLoopProtection ────────────────────────────────────────────────

describe('addInfiniteLoopProtection', () => {
  test('injects loop guard into for loop', () => {
    const code = `for (let i = 0; i < 10; i++) { doSomething(); }`;
    const result = addInfiniteLoopProtection(code);
    expect(result).toContain('Date.now()');
    expect(result).toContain('window.stopRunning()');
  });

  test('injects loop guard into while loop', () => {
    const code = `while (true) { doSomething(); }`;
    const result = addInfiniteLoopProtection(code);
    expect(result).toContain('Date.now()');
  });

  test('injects loop guard into do-while loop', () => {
    const code = `do { doSomething(); } while (true);`;
    const result = addInfiniteLoopProtection(code);
    expect(result).toContain('Date.now()');
  });

  test('leaves code without loops unchanged', () => {
    const code = `const x = 1 + 2;`;
    const result = addInfiniteLoopProtection(code);
    expect(result).toBe(code);
  });

  test('injects unique variable per loop', () => {
    const code = `for (let i = 0; i < 3; i++) {}\nfor (let j = 0; j < 3; j++) {}`;
    const result = addInfiniteLoopProtection(code);
    expect(result).toContain('_wmloopvar1');
    expect(result).toContain('_wmloopvar2');
  });
});

// ── extractScriptLine ─────────────────────────────────────────────────────────

describe('extractScriptLine', () => {
  test('returns null for error with no stack', () => {
    expect(extractScriptLine({})).toBeNull();
  });

  test('extracts line from Chrome-style stack', () => {
    const err = { stack: 'Error: boom\n    at <anonymous>:15:8' };
    expect(extractScriptLine(err)).toBe(15);
  });

  test('extracts line from eval-style stack', () => {
    const err = { stack: 'TypeError: x\n    at eval at exec (app.js:1:1):22:4' };
    expect(extractScriptLine(err)).toBe(22);
  });

  test('extracts line from Firefox-style stack', () => {
    const err = { stack: 'myFn@debugger eval code:9:3' };
    expect(extractScriptLine(err)).toBe(9);
  });

  test('falls back to error.lineNumber when no stack', () => {
    const err = { stack: '', lineNumber: 42 };
    expect(extractScriptLine(err)).toBe(42);
  });

  test('returns null for completely empty error', () => {
    expect(extractScriptLine(null)).toBeNull();
    expect(extractScriptLine(undefined)).toBeNull();
  });
});
