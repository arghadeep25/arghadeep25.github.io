import './inner.js';
import '../styles/blog-figure.css';
import '../styles/blog-formula.css';
import { initFormula } from '../blog/formula.js';
import { drift } from '../blog/figs/drift.js';

const FIGURES = { drift };

document.querySelectorAll('[data-fig]').forEach((el) => FIGURES[el.dataset.fig]?.(el));
document.querySelectorAll('.fm').forEach(initFormula);
