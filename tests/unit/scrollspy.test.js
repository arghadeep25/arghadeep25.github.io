import { describe, expect, it } from 'vitest';
import { activeSectionId } from '../../src/core/scrollspy.js';

const sections = [
  { id: 'home', top: 0, bottom: 1000 },
  { id: 'about', top: 1000, bottom: 1800 },
  { id: 'skills', top: 1800, bottom: 3000 },
];

describe('activeSectionId', () => {
  it('finds the section under the line', () => {
    expect(activeSectionId(sections, 10)).toBe('home');
    expect(activeSectionId(sections, 1500)).toBe('about');
    expect(activeSectionId(sections, 2999)).toBe('skills');
  });
  it('treats a section start as inside and its end as outside', () => {
    expect(activeSectionId(sections, 1000)).toBe('about');
    expect(activeSectionId(sections, 999)).toBe('home');
  });
  it('returns null outside every section', () => {
    expect(activeSectionId(sections, 3000)).toBeNull();
    expect(activeSectionId([], 10)).toBeNull();
  });
});
