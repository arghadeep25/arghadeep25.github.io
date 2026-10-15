import { describe, expect, it } from 'vitest';
import { VISUALS, createVisual } from '../../src/sections/blog-visuals.js';

/** A 2D context stand-in that records which drawing calls were made. */
function mockContext() {
  const calls = {};
  return {
    calls,
    ctx: new Proxy(
      {},
      {
        get: (_, prop) => {
          if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
          return (...args) => {
            calls[prop] = (calls[prop] || 0) + 1;
            return args;
          };
        },
        set: () => true,
      },
    ),
  };
}

describe('blog visuals', () => {
  it.each(Object.keys(VISUALS))(
    '%s draws something at every point of its loop without throwing',
    (name) => {
      const draw = createVisual(name);
      const { ctx, calls } = mockContext();
      for (let t = 0; t < 30; t += 0.4) {
        draw(ctx, 300, 290, t, 0.016);
      }
      const drew = (calls.stroke || 0) + (calls.fill || 0) + (calls.fillText || 0);
      expect(drew).toBeGreaterThan(30);
    },
  );

  it('keeps state per tile: two pure-pursuit tiles do not share a car', () => {
    const a = createVisual('pp');
    const b = createVisual('pp');
    const { ctx } = mockContext();
    for (let i = 0; i < 120; i++) a(ctx, 300, 290, i / 60, 0.016);
    const mb = mockContext();
    b(mb.ctx, 300, 290, 0, 0.016);
    expect(mb.calls.arc).toBeGreaterThan(0);
  });

  it('rejects an unknown visual', () => {
    expect(() => createVisual('nope')).toThrow(/Unknown blog visual/);
  });
});
