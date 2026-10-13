import { describe, expect, it } from 'vitest';
import { nextStep } from '../../src/core/typewriter.js';

const words = ['Hi', 'Yo'];

function run(steps) {
  let state = { word: 0, len: 0, deleting: false };
  const out = [];
  for (let i = 0; i < steps; i++) {
    const s = nextStep(state, words);
    state = s.state;
    out.push(s.text);
  }
  return out;
}

describe('nextStep', () => {
  it('types, deletes, then moves to the next word', () => {
    expect(run(7)).toEqual(['H', 'Hi', 'H', '', 'Y', 'Yo', 'Y']);
  });
  it('wraps back to the first word', () => {
    expect(run(11).slice(8)).toEqual(['H', 'Hi', 'H']);
  });
  it('holds longer on the last word', () => {
    let state = { word: 1, len: 1, deleting: false };
    const last = nextStep(state, words);
    state = { word: 0, len: 1, deleting: false };
    const first = nextStep(state, words);
    expect(last.delay).toBeGreaterThan(first.delay);
  });
});
