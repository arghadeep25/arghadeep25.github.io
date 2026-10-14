import '../styles/index.css';
import '../styles/sections/footer.css';
import '../styles/pixworm/lightbox.css';
import '../styles/pixworm/page.css';
import { initShell } from './shell.js';
import { COLLECTIONS, HERO, SELECTED } from '../pixworm/photos.js';
import { initHero } from '../pixworm/hero.js';
import { initStrip } from '../pixworm/strip.js';
import { renderMosaic } from '../pixworm/mosaic.js';
import { createLightbox } from '../pixworm/lightbox.js';

initShell();
initHero(document.getElementById('opening'), HERO);
initStrip(document.getElementById('collections'), COLLECTIONS);
renderMosaic(document.querySelector('.mosaic'), SELECTED, createLightbox());
