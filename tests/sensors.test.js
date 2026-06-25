import { SensorsAPI, cleanupSensors } from '../src/api/sensors.js';

// ── cleanupSensors ────────────────────────────────────────────────────────────

describe('cleanupSensors', () => {
  test('callable without error', () => {
    expect(() => cleanupSensors()).not.toThrow();
  });
  test('idempotent — safe to call multiple times', () => {
    expect(() => { cleanupSensors(); cleanupSensors(); cleanupSensors(); }).not.toThrow();
  });
});

// ── Signal-bus contract ───────────────────────────────────────────────────────
// Every SensorsAPI signal must expose: synchronous live getters + .stream(fn).

describe('SensorsAPI.mouse() — signal shape', () => {
  test('returns an object', () => {
    expect(typeof SensorsAPI.mouse()).toBe('object');
  });
  test('has numeric live getters: x y px py vx vy speed buttons', () => {
    const sig = SensorsAPI.mouse();
    for (const prop of ['x', 'y', 'px', 'py', 'vx', 'vy', 'speed', 'buttons']) {
      expect(typeof sig[prop]).toBe('number');
    }
  });
  test('has boolean getters: left right middle', () => {
    const sig = SensorsAPI.mouse();
    expect(typeof sig.left).toBe('boolean');
    expect(typeof sig.right).toBe('boolean');
    expect(typeof sig.middle).toBe('boolean');
  });
  test('has stream method', () => {
    expect(typeof SensorsAPI.mouse().stream).toBe('function');
  });
  test('has edge-trigger methods: onMove onButton', () => {
    const sig = SensorsAPI.mouse();
    expect(typeof sig.onMove).toBe('function');
    expect(typeof sig.onButton).toBe('function');
  });
  test('x/y normalized (0–1) when no events fired', () => {
    const sig = SensorsAPI.mouse();
    expect(sig.x).toBeGreaterThanOrEqual(0);
    expect(sig.x).toBeLessThanOrEqual(1);
    expect(sig.y).toBeGreaterThanOrEqual(0);
    expect(sig.y).toBeLessThanOrEqual(1);
  });
});

describe('SensorsAPI.keyboard() — signal shape', () => {
  test('returns an object', () => {
    expect(typeof SensorsAPI.keyboard()).toBe('object');
  });
  test('held is a Set', () => {
    expect(SensorsAPI.keyboard().held).toBeInstanceOf(Set);
  });
  test('last is a string', () => {
    expect(typeof SensorsAPI.keyboard().last).toBe('string');
  });
  test('is() method available', () => {
    expect(typeof SensorsAPI.keyboard().is).toBe('function');
  });
  test('any() method available', () => {
    expect(typeof SensorsAPI.keyboard().any).toBe('function');
  });
  test('is() returns false for unbound key', () => {
    expect(SensorsAPI.keyboard().is('F12')).toBe(false);
  });
  test('any() returns false when no keys held', () => {
    expect(SensorsAPI.keyboard().any('F12', 'F11')).toBe(false);
  });
  test('has stream method', () => {
    expect(typeof SensorsAPI.keyboard().stream).toBe('function');
  });
  test('has onKey method', () => {
    expect(typeof SensorsAPI.keyboard().onKey).toBe('function');
  });
});

describe('SensorsAPI.motion() — signal shape', () => {
  test('returns an object', () => {
    expect(typeof SensorsAPI.motion()).toBe('object');
  });
  test('has numeric getters: ax ay az gx gy gz alpha beta gamma magnitude', () => {
    const sig = SensorsAPI.motion();
    for (const p of ['ax','ay','az','gx','gy','gz','alpha','beta','gamma','magnitude']) {
      expect(typeof sig[p]).toBe('number');
    }
  });
  test('has stream, onShake, onTilt methods', () => {
    const sig = SensorsAPI.motion();
    expect(typeof sig.stream).toBe('function');
    expect(typeof sig.onShake).toBe('function');
    expect(typeof sig.onTilt).toBe('function');
  });
});

describe('SensorsAPI.network() — signal shape', () => {
  test('returns an object with online boolean', () => {
    const sig = SensorsAPI.network();
    expect(typeof sig.online).toBe('boolean');
  });
  test('has onChange method', () => {
    expect(typeof SensorsAPI.network().onChange).toBe('function');
  });
});

// ── stream does not throw when called ────────────────────────────────────────

describe('SensorsAPI signals — stream callback', () => {
  test('mouse.stream does not throw (RAF fires on fake timers)', () => {
    vi.useFakeTimers();
    const calls = [];
    const sig = SensorsAPI.mouse();
    sig.stream((s) => calls.push(s));
    vi.advanceTimersByTime(20);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
    cleanupSensors();
  });
});
