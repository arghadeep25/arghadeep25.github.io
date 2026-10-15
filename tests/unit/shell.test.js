import { describe, expect, it } from 'vitest';
import { footerHtml, navHtml, NAV } from '../../src/pages/shell.js';

describe('shell', () => {
  it('lists every section once', () => {
    const html = navHtml();
    NAV.forEach((n) => expect(html.split(`href="${n.href}"`).length).toBe(2));
  });

  it('marks only the active section', () => {
    const html = navHtml('blogs');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain('href="/blogs.html" aria-current="page"');
  });

  it('marks nothing for an unknown section', () => {
    expect(navHtml('nope')).not.toContain('aria-current');
  });

  it('puts the year in the footer', () => {
    expect(footerHtml(2031)).toContain('&copy; 2031');
  });

  it('opens external links safely', () => {
    const links = footerHtml().match(/<a [^>]*target="_blank"[^>]*>/g);
    links.forEach((a) => expect(a).toContain('rel="noopener"'));
  });
});
