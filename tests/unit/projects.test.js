import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  activeChapter,
  chapterScrollTop,
  railFill,
} from '../../src/sections/projects.js';

describe('chapters', () => {
  it('follow the order of the stack, each with a page to show', () => {
    expect(CHAPTERS.map((c) => c.kicker)).toEqual([
      'What does the world look like',
      'Where am I',
      'What is around me',
      'Where do I go',
      'How do I steer',
      'Is everything healthy',
    ]);
    expect(CHAPTERS.map((c) => c.src)).toEqual([
      '/projects/mapping.html',
      '/projects/localization.html',
      '/projects/obstacle-detection.html',
      '/projects/stack.html?stage=route',
      '/projects/path-tracking.html',
      '/projects/stack.html?stage=guardian',
    ]);
  });

  it('use only public wording', () => {
    const text = JSON.stringify(CHAPTERS).toLowerCase();
    for (const word of ['av-', 'ottonomy', 'ottopia', 'internal']) expect(text).not.toContain(word);
  });
});

describe('activeChapter', () => {
  it('splits the track evenly', () => {
    expect([0, 0.16, 0.17, 0.5, 0.99, 1].map((p) => activeChapter(p, 6))).toEqual([
      0, 0, 1, 3, 5, 5,
    ]);
  });
  it('clamps outside the track', () => {
    expect(activeChapter(-1, 6)).toBe(0);
    expect(activeChapter(2, 6)).toBe(5);
  });
});

describe('railFill', () => {
  it('is empty at the start, full at the end, and half in the middle', () => {
    expect(railFill(0, 6)).toBe(0);
    expect(railFill(1, 6)).toBe(1);
    expect(railFill(0.5, 6)).toBeCloseTo(0.5, 5);
  });
  it('handles a single chapter', () => {
    expect(railFill(0.7, 1)).toBe(0);
  });
});

describe('chapterScrollTop', () => {
  it('centres chapter i in its slice of the scroll span', () => {
    const base = { trackTop: 1000, trackHeight: 5000, scrollY: 200, viewport: 800, n: 4 };
    expect(chapterScrollTop({ ...base, i: 0 })).toBe(200 + 1000 + 4200 * 0.125);
    expect(chapterScrollTop({ ...base, i: 3 })).toBe(200 + 1000 + 4200 * 0.875);
  });
});
