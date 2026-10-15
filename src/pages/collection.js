import '../styles/index.css';
import '../styles/sections/footer.css';
import '../styles/pixworm/lightbox.css';
import '../styles/pixworm/page.css';
import '../styles/pixworm/collection.css';
import { initShell } from './shell.js';
import { COLLECTIONS } from '../pixworm/photos.js';
import { findCollection } from '../pixworm/images.js';
import { renderMosaic } from '../pixworm/mosaic.js';
import { createLightbox, parseHash } from '../pixworm/lightbox.js';

initShell();

const slug = document.body.dataset.collection;
const c = findCollection(COLLECTIONS, slug);
const i = COLLECTIONS.indexOf(c);
const next = COLLECTIONS[(i + 1) % COLLECTIONS.length];

document.querySelector('[data-title]').textContent = c.title;
document.querySelector('[data-blurb]').textContent = c.blurb;
document.querySelector('[data-count]').textContent = `${c.photos.length} photos`;
const nextLink = document.querySelector('[data-next]');
nextLink.href = `/pixworm/${next.slug}.html`;
nextLink.textContent = next.title;

const lightbox = createLightbox();
renderMosaic(document.querySelector('.mosaic'), c.photos, lightbox);

// a link like /pixworm/prague.html#p12 opens that photo
const first = parseHash(location.hash, c.photos.length);
if (first >= 0) lightbox.open(c.photos, first);
