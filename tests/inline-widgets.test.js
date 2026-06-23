import { initInlineWidgets } from '../src/editor/inline-widgets.js';

// ── Canvas stub ───────────────────────────────────────────────────────────────
// setup.js stubs getContext without getImageData; colorToHex needs it.
HTMLCanvasElement.prototype.getContext = function (type) {
  if (type !== '2d') return null;
  return {
    fillStyle: '',
    fillRect: () => {},
    // Return a fixed red pixel — exact color doesn't matter for placement tests
    getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255]) }),
  };
};

// ── Mock CodeMirror ───────────────────────────────────────────────────────────
function makeCM(initialCode = '') {
  let code = initialCode;
  const listeners = { change: [] };
  const marks = [];
  const bookmarks = [];

  const cm = {
    getValue: () => code,
    setValue: (v) => { code = v; },
    posFromIndex: (i) => {
      let line = 0, ch = 0;
      for (let j = 0; j < i && j < code.length; j++) {
        if (code[j] === '\n') { line++; ch = 0; } else ch++;
      }
      return { line, ch };
    },
    markText: vi.fn((from, to, opts) => {
      const mark = { from, to, opts, clear: vi.fn() };
      marks.push(mark);
      return mark;
    }),
    setBookmark: vi.fn((pos, opts) => {
      const bm = { pos, opts, clear: vi.fn() };
      bookmarks.push(bm);
      return bm;
    }),
    replaceRange: vi.fn((text, from, to) => { code = text; }),
    on: (event, fn) => { listeners[event]?.push(fn); },
    _marks: marks,
    _bookmarks: bookmarks,
    _triggerChange: () => listeners.change.forEach((fn) => fn()),
  };
  return cm;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function settle() {
  vi.advanceTimersByTime(1000); // past all debounce timers
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('initInlineWidgets', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('returns refresh / clear / destroy interface', () => {
    const cm = makeCM('');
    const widgets = initInlineWidgets(cm);
    expect(typeof widgets.refresh).toBe('function');
    expect(typeof widgets.clear).toBe('function');
    expect(typeof widgets.destroy).toBe('function');
  });

  test('no marks when no Turtle declared', () => {
    const cm = makeCM('console.log("hello");');
    initInlineWidgets(cm);
    settle();
    expect(cm.markText).not.toHaveBeenCalled();
  });

  test('no marks when turtle declared but no patchable calls', () => {
    const cm = makeCM('const t = new Turtle();\nt.home();');
    initInlineWidgets(cm);
    settle();
    expect(cm.markText).not.toHaveBeenCalled();
  });

  test('places color widget as bookmark (not markText)', () => {
    const cm = makeCM('const t = new Turtle();\nt.color("red");');
    initInlineWidgets(cm);
    settle();
    expect(cm.setBookmark).toHaveBeenCalledTimes(1);
    expect(cm.markText).not.toHaveBeenCalled();
  });

  test('color bookmark widget is a swatch element', () => {
    const cm = makeCM('const t = new Turtle();\nt.color("blue");');
    initInlineWidgets(cm);
    settle();
    const { opts } = cm._bookmarks[0];
    const el = opts.widget;
    expect(el.className).toBe('ar-color-swatch');
    expect(el.tagName).toBe('SPAN');
  });

  test('color bookmark uses insertLeft: true and handleMouseEvents: false', () => {
    const cm = makeCM('const t = new Turtle();\nt.color("green");');
    initInlineWidgets(cm);
    settle();
    expect(cm._bookmarks[0].opts.insertLeft).toBe(true);
    expect(cm._bookmarks[0].opts.handleMouseEvents).toBe(false);
  });

  test('places scrub mark for numeric literal in turtle call', () => {
    const cm = makeCM('const t = new Turtle();\nt.forward(100);');
    initInlineWidgets(cm);
    settle();
    expect(cm.markText).toHaveBeenCalledTimes(1);
    const widget = cm.markText.mock.calls[0][2].replacedWith;
    expect(widget.className).toBe('ar-scrub');
    expect(widget.textContent).toBe('100');
  });

  test('places scrub mark for each numeric arg separately', () => {
    const cm = makeCM('const t = new Turtle();\nt.forward(50);\nt.right(90);');
    initInlineWidgets(cm);
    settle();
    expect(cm.markText).toHaveBeenCalledTimes(2);
  });

  test('places marks for both color and numeric args', () => {
    const cm = makeCM(
      'const t = new Turtle();\nt.color("red");\nt.thickness(3);\nt.forward(100);',
    );
    initInlineWidgets(cm);
    settle();
    // color → 1 bookmark; thickness(3) + forward(100) → 2 markText
    expect(cm.setBookmark).toHaveBeenCalledTimes(1);
    expect(cm.markText).toHaveBeenCalledTimes(2);
  });

  test('marks numeric args in any method call', () => {
    const cm = makeCM('Math.random(1, 2);\nconsole.log(42);');
    initInlineWidgets(cm);
    settle();
    // Math.random(1, 2) → 2 scrubbers; console.log(42) → 1 scrubber
    expect(cm.markText).toHaveBeenCalledTimes(3);
  });

  test('handles multiple turtle instances', () => {
    const cm = makeCM(
      'const a = new Turtle();\nconst b = new Turtle();\na.forward(10);\nb.forward(20);',
    );
    initInlineWidgets(cm);
    settle();
    expect(cm.markText).toHaveBeenCalledTimes(2);
  });

  test('only marks color method for string args, not other string methods', () => {
    const cm = makeCM('const t = new Turtle();\nt.forward("oops");\nt.color("red");');
    initInlineWidgets(cm);
    settle();
    // forward("oops") → string, not color → no widget; color("red") → bookmark
    expect(cm.markText).not.toHaveBeenCalled();
    expect(cm.setBookmark).toHaveBeenCalledTimes(1);
  });

  test('does not crash on syntax error in editor', () => {
    const cm = makeCM('const t = new Turtle();\nt.forward(((');
    initInlineWidgets(cm);
    expect(() => settle()).not.toThrow();
    expect(cm.markText).not.toHaveBeenCalled();
  });

  test('clear() removes all active marks and bookmarks', () => {
    const cm = makeCM('const t = new Turtle();\nt.color("red");\nt.forward(100);');
    const widgets = initInlineWidgets(cm);
    settle();
    widgets.clear();
    cm._marks.forEach((m) => expect(m.clear).toHaveBeenCalled());
    cm._bookmarks.forEach((b) => expect(b.clear).toHaveBeenCalled());
  });

  test('refresh() re-runs placement immediately', () => {
    const cm = makeCM('const t = new Turtle();\nt.forward(100);');
    const widgets = initInlineWidgets(cm);
    settle();
    cm.markText.mockClear();
    cm._marks.length = 0;
    widgets.refresh();
    expect(cm.markText).toHaveBeenCalledTimes(1);
  });

  test('marks are re-placed after editor change debounce', () => {
    const cm = makeCM('const t = new Turtle();');
    initInlineWidgets(cm);
    settle();
    expect(cm.markText).not.toHaveBeenCalled();

    cm.setValue('const t = new Turtle();\nt.forward(50);');
    cm._triggerChange();
    vi.advanceTimersByTime(800);
    expect(cm.markText).toHaveBeenCalledTimes(1);
  });

  test('destroy() prevents further mark placement', () => {
    const cm = makeCM('const t = new Turtle();\nt.forward(100);');
    const widgets = initInlineWidgets(cm);
    widgets.destroy();
    settle();
    expect(cm.markText).not.toHaveBeenCalled();
  });

  test('marks are cleared before re-placement on change', () => {
    const cm = makeCM('const t = new Turtle();\nt.forward(100);');
    initInlineWidgets(cm);
    settle();
    const firstMark = cm._marks[0];
    expect(firstMark.clear).not.toHaveBeenCalled();

    cm._triggerChange();
    vi.advanceTimersByTime(800);
    // Old mark cleared before new ones placed
    expect(firstMark.clear).toHaveBeenCalled();
  });

  test('handleMouseEvents is false on all markText marks', () => {
    const cm = makeCM(
      'const t = new Turtle();\nt.color("red");\nt.forward(100);',
    );
    initInlineWidgets(cm);
    settle();
    for (const call of cm.markText.mock.calls) {
      expect(call[2].handleMouseEvents).toBe(false);
    }
  });
});
