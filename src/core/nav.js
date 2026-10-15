/**
 * Does `href` point at the page shown at `pathname`?
 * "/" and "/index.html" are the same page. Query strings and hashes are ignored.
 * @param {string} href link target, relative or absolute
 * @param {string} pathname current location.pathname
 * @param {string} [base] origin used to resolve relative links
 */
export function isCurrent(href, pathname, base = 'http://localhost/') {
  if (!href || href.startsWith('#')) return false;
  const norm = (p) => p.replace(/index\.html$/, '').replace(/\/+$/, '') || '/';
  const target = new URL(href, new URL(pathname, base));
  return norm(target.pathname) === norm(pathname);
}

/**
 * Mark the link that matches the current page with aria-current="page".
 * @param {ParentNode} [root] element that contains the nav links
 */
export function markCurrentPage(root = document) {
  const links = root.querySelectorAll('.nav-pill a');
  links.forEach((a) => {
    if (isCurrent(a.getAttribute('href'), location.pathname, location.origin)) {
      a.setAttribute('aria-current', 'page');
    } else {
      a.removeAttribute('aria-current');
    }
  });
}
