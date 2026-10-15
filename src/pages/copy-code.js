/** Makes every `.copy-button` copy the code block it sits in. */
export function initCopyCode(root = document) {
  root.querySelectorAll('.code-snippet').forEach((box) => {
    const button = box.querySelector('.copy-button');
    const code = box.querySelector('code');
    if (!button || !code) return;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
      } catch {
        return;
      }
      button.textContent = 'Copied';
      button.classList.add('is-done');
      setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('is-done');
      }, 1500);
    });
  });
}
