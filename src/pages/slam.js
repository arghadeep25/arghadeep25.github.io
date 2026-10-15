import './inner.js';
import '../styles/blog-figure.css';
import '../styles/blog-formula.css';
import { initFormula } from '../blog/formula.js';
import { drift } from '../blog/figs/drift.js';
import { edges } from '../blog/figs/edges.js';
import { loop } from '../blog/figs/loop.js';
import { nodes } from '../blog/figs/nodes.js';
import { anchor } from '../blog/figs/anchor.js';
import { bowl } from '../blog/figs/bowl.js';
import { steps } from '../blog/figs/steps.js';
import { sum } from '../blog/figs/sum.js';
import { tug } from '../blog/figs/tug.js';

const FIGURES = { drift, nodes, edges, tug, loop, sum, bowl, steps, anchor };

document.querySelectorAll('[data-fig]').forEach((el) => FIGURES[el.dataset.fig]?.(el));
document.querySelectorAll('.fm').forEach(initFormula);
