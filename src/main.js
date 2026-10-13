import './styles/index.css';
import './styles/sections/landing.css';
import './styles/sections/about.css';
import './styles/sections/skills.css';
import { initScrollSpy } from './core/scrollspy.js';
import { initLanding } from './sections/landing.js';
import { initAbout } from './sections/about.js';
import { initSkills } from './sections/skills.js';

const SECTIONS = ['home', 'about', 'projects', 'skills', 'pixworm', 'blogs'];

initScrollSpy(document.querySelector('.nav-pill'), SECTIONS);

initLanding(document.getElementById('home'));
initAbout(document.getElementById('about'));
initSkills(document.getElementById('skills'));
