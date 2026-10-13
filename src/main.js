import './styles/index.css';
import './styles/sections/landing.css';
import './styles/sections/about.css';
import './styles/sections/projects.css';
import './styles/sections/skills.css';
import './styles/sections/pixworm.css';
import './styles/sections/blogs.css';
import './styles/sections/footer.css';
import { initScrollSpy } from './core/scrollspy.js';
import { initLanding } from './sections/landing.js';
import { initAbout } from './sections/about.js';
import { initSkills } from './sections/skills.js';
import { initPixworm } from './sections/pixworm.js';
import { initBlogs } from './sections/blogs.js';

const SECTIONS = ['home', 'about', 'projects', 'skills', 'pixworm', 'blogs'];

initScrollSpy(document.querySelector('.nav-pill'), SECTIONS);

initLanding(document.getElementById('home'));
initAbout(document.getElementById('about'));
initSkills(document.getElementById('skills'));

initPixworm(document.getElementById('pixworm'), [
  { src: '/images/pixworm/p1.jpg', caption: 'Blossom', focusY: 0.66 },
  { src: '/images/pixworm/p2.jpg', caption: 'Raindrops', focusY: 0.62 },
  { src: '/images/pixworm/p3.jpg', caption: 'First leaves', focusY: 0.66 },
  { src: '/images/pixworm/p4.jpg', caption: 'Dusk', focusY: 0.6 },
  { src: '/images/pixworm/p5.jpg', caption: 'Coreopsis', focusY: 0.5 },
  { src: '/images/pixworm/p6.jpg', caption: 'Tulips', focusY: 0.62 },
  { src: '/images/pixworm/p7.jpg', caption: 'Garden at sunset', focusY: 0.58 },
]);

initBlogs(document.getElementById('blogs'));

document.querySelector('[data-year]').textContent = new Date().getFullYear();
