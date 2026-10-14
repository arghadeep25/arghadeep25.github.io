import { describe, expect, it } from 'vitest';
import { COLLECTIONS, HERO, SELECTED } from '../../src/pixworm/photos.js';
import { findCollection, photoUrl, widthFor } from '../../src/pixworm/images.js';

describe('photoUrl', () => {
  it('asks Drive for a thumbnail of the wanted width', () => {
    expect(photoUrl('abc-123_X', 1000)).toBe(
      'https://drive.google.com/thumbnail?id=abc-123_X&sz=w1000',
    );
  });

  it('swaps the size on a Google Photos link', () => {
    expect(photoUrl('https://lh3.googleusercontent.com/pw/AAA=w2400', 800)).toBe(
      'https://lh3.googleusercontent.com/pw/AAA=w800',
    );
  });

  it('adds a size when the link has none', () => {
    expect(photoUrl('https://lh3.googleusercontent.com/pw/AAA', 800)).toBe(
      'https://lh3.googleusercontent.com/pw/AAA=w800',
    );
  });

  it('rounds the width', () => {
    expect(photoUrl('x', 799.6)).toContain('sz=w800');
  });
});

describe('widthFor', () => {
  it('steps in 200px and caps the pixel ratio at 2', () => {
    expect(widthFor(300, 1)).toBe(400);
    expect(widthFor(300, 3)).toBe(600);
    expect(widthFor(300, 2)).toBe(600);
  });
});

describe('photo data', () => {
  it('has unique slugs and non empty collections', () => {
    const slugs = COLLECTIONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    COLLECTIONS.forEach((c) => {
      expect(c.title && c.group && c.cover).toBeTruthy();
      expect(c.photos.length).toBeGreaterThan(0);
    });
  });

  it('has no repeated photo inside a collection', () => {
    COLLECTIONS.forEach((c) => expect(new Set(c.photos).size).toBe(c.photos.length));
  });

  it('only holds Drive ids or Google Photos links', () => {
    const ok = (p) => /^[\w-]{20,}$/.test(p) || /^https:\/\/lh3\.googleusercontent\.com\//.test(p);
    [...HERO, ...SELECTED, ...COLLECTIONS.flatMap((c) => [c.cover, ...c.photos])].forEach((p) =>
      expect(ok(p), p).toBe(true),
    );
  });

  it('features photos that exist in a collection', () => {
    const all = new Set(COLLECTIONS.flatMap((c) => c.photos));
    SELECTED.forEach((p) => expect(all.has(p)).toBe(true));
  });

  it('finds a collection by slug', () => {
    expect(findCollection(COLLECTIONS, 'prague').title).toBe('Prague');
    expect(findCollection(COLLECTIONS, 'nope')).toBeUndefined();
  });
});
