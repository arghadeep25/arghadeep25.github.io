/**
 * Shared chrome for inner pages (blogs, galleries): the floating nav and the footer.
 * The builders return strings so they can be tested without a DOM.
 */
export const NAV = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'about', label: 'About', href: '/#about' },
  { id: 'projects', label: 'Work', href: '/#projects' },
  { id: 'skills', label: 'Skills', href: '/#skills' },
  { id: 'pixworm', label: 'Pixworm', href: '/pixworm.html' },
  { id: 'blogs', label: 'Blogs', href: '/blogs.html' },
];

export const LINKS = [
  { label: 'GitHub', href: 'https://github.com/arghadeep25' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/arghadeepmazumder/' },
  { label: 'YouTube', href: 'https://www.youtube.com/@arghadeepmazumder2133' },
  { label: 'Facebook', href: 'https://www.facebook.com/amazumder' },
];

/** @param {string} [active] id of the section this page belongs to */
export function navHtml(active) {
  const items = NAV.map(
    (n) => `<a href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${n.label}</a>`,
  ).join('');
  return `<nav class="nav-pill glass" aria-label="Main">${items}</nav>`;
}

/** @param {number} [year] */
export function footerHtml(year = new Date().getFullYear()) {
  const links = LINKS.map(
    (l) => `<li><a href="${l.href}" target="_blank" rel="noopener">${l.label}</a></li>`,
  ).join('');
  return `<footer class="footer"><div class="wrap footer__row"><p>&copy; ${year} Arghadeep Mazumder</p><ul class="footer__links">${links}</ul><a class="footer__top" href="#top">Back to top</a></div></footer>`;
}

/** Fills `[data-shell="nav"]` and `[data-shell="footer"]` on the page. */
export function initShell(doc = document) {
  const active = doc.body.dataset.section;
  const nav = doc.querySelector('[data-shell="nav"]');
  const foot = doc.querySelector('[data-shell="footer"]');
  if (nav) nav.outerHTML = navHtml(active);
  if (foot) foot.outerHTML = footerHtml();
}
