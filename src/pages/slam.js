import './inner.js';
import '../styles/blog-figure.css';
import '../styles/blog-formula.css';
import { initFormula } from '../blog/formula.js';
import { chicken } from '../blog/figs/chicken.js';
import { overview } from '../blog/figs/overview.js';
import { pipeline } from '../blog/figs/pipeline.js';
import { landmark } from '../blog/figs/landmark.js';
import { bell } from '../blog/figs/bell.js';
import { drift } from '../blog/figs/drift.js';
import { edges } from '../blog/figs/edges.js';
import { fog } from '../blog/figs/fog.js';
import { loop } from '../blog/figs/loop.js';
import { nodes } from '../blog/figs/nodes.js';
import { anchor } from '../blog/figs/anchor.js';
import { bowl } from '../blog/figs/bowl.js';
import { steps } from '../blog/figs/steps.js';
import { outlier } from '../blog/figs/outlier.js';
import { sum } from '../blog/figs/sum.js';
import { tug } from '../blog/figs/tug.js';

const FIGURES = {
  chicken,
  overview,
  pipeline,
  landmark,
  bell,
  drift,
  nodes,
  edges,
  tug,
  loop,
  sum,
  bowl,
  steps,
  anchor,
  fog,
  outlier,
};

document.querySelectorAll('[data-fig]').forEach((el) => FIGURES[el.dataset.fig]?.(el));
document.querySelectorAll('.fm').forEach(initFormula);
