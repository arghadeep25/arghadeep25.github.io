/**
 * Turns a photo entry from photos.js into an image address of a given width.
 * Entries are a Drive file id or a full Google Photos link.
 */
const isLink = (entry) => /^https?:\/\//.test(entry);

/**
 * @param {string} entry Drive file id or Google Photos link
 * @param {number} width wanted width in pixels
 */
export function photoUrl(entry, width) {
  const w = Math.round(width);
  if (isLink(entry)) return entry.replace(/=[wsh]\d+[^/]*$/, '') + `=w${w}`;
  return `https://drive.google.com/thumbnail?id=${entry}&sz=w${w}`;
}

/** Width to request for a slot: device pixels, rounded up to a 200px step so URLs repeat. */
export function widthFor(cssPx, dpr = 1) {
  return Math.ceil((cssPx * Math.min(dpr, 2)) / 200) * 200;
}

/** @param {{ slug: string }[]} collections */
export function findCollection(collections, slug) {
  return collections.find((c) => c.slug === slug);
}
