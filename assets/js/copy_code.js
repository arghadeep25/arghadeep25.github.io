document.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', () => {
        const codeBlock = button.previousElementSibling.textContent;
        navigator.clipboard.writeText(codeBlock).then(() => {
            const tooltip = button.nextElementSibling;
            tooltip.classList.add('show');
            setTimeout(() => tooltip.classList.remove('show'), 1500);
        });
    });
});