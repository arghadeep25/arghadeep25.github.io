import '../styles/index.css';
import '../styles/sections/footer.css';
import '../styles/pixworm/lightbox.css';
import '../styles/pixworm/hall.css';
import '../styles/pixworm/page.css';
import { initShell } from './shell.js';
import { COLLECTIONS, SELECTED } from '../pixworm/photos.js';
import { initHall } from '../pixworm/hall.js';
import { initStrip } from '../pixworm/strip.js';
import { renderMosaic } from '../pixworm/mosaic.js';
import { createLightbox } from '../pixworm/lightbox.js';

initShell();
const lightbox = createLightbox();
initHall(document.getElementById('opening'), COLLECTIONS, lightbox);
initStrip(document.getElementById('collections'), COLLECTIONS);
renderMosaic(document.querySelector('.mosaic'), SELECTED, lightbox);
