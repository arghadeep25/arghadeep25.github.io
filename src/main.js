import './styles/index.css';
import './styles/sections/landing.css';
import { initScrollSpy } from './core/scrollspy.js';
import { initLanding } from './sections/landing.js';

const SECTIONS = ['home', 'about', 'projects', 'skills', 'pixworm', 'blogs'];

initScrollSpy(document.querySelector('.nav-pill'), SECTIONS);

initLanding(document.getElementById('home'));
