global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement canvas getContext — stub it so text-to-blocks.js
// can call namedColorToHex() without crashing.
const _stubCtx = {
  clearRect: () => {},
  fillStyle: '#000000',
  fillRect: () => {},
};
HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return _stubCtx;
  return null;
};
