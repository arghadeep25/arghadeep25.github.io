import './styles/index.css';
import { initScrollSpy } from './core/scrollspy.js';

const SECTIONS = ['home', 'about', 'projects', 'skills', 'pixworm', 'blogs'];

initScrollSpy(document.querySelector('.nav-pill'), SECTIONS);
