function toggleTheme() {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';

    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // ✅ Update label
    document.getElementById('theme-label').textContent =
        newTheme.charAt(0).toUpperCase() + newTheme.slice(1);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-label').textContent =
        savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1);
}

// ✅ Build TOC dynamically
function buildTOC() {
    const tocList = document.getElementById("toc-list");
    const headings = document.querySelectorAll("main h2");
    headings.forEach((h, i) => {
        const id = "section-" + i;
        h.setAttribute("id", id);
        const li = document.createElement("li");
        li.innerHTML = `<a href="#${id}">${h.textContent}</a>`;
        tocList.appendChild(li);
    });
}

// ✅ Highlight TOC on scroll
function scrollSpy() {
    const sections = document.querySelectorAll("main h2");
    const tocLinks = document.querySelectorAll(".toc a");

    let current = "";
    const scrollPos = window.scrollY + 120; // add offset for navbar height

    sections.forEach((section) => {
        const sectionTop = section.offsetTop;
        const sectionBottom = sectionTop + section.offsetHeight;
        if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
            current = section.getAttribute("id");
        }
    });

    tocLinks.forEach((link) => {
        link.classList.remove("active");
        if (link.getAttribute("href") === "#" + current) {
            link.classList.add("active");
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    buildTOC();
    window.addEventListener("scroll", scrollSpy);
});

function toggleSidebar() {
    document.querySelector(".sidebar").classList.toggle("hidden");
}

// Copy code functionality
// function copyCode(button, codeId) {
//     const code = document.getElementById(codeId).textContent;

//     navigator.clipboard.writeText(code).then(() => {
//         const originalText = button.textContent;
//         button.textContent = 'Copied!';
//         button.classList.add('copied');

//         setTimeout(() => {
//             button.textContent = originalText;
//             button.classList.remove('copied');
//         }, 2000);
//     });
// }

document.querySelectorAll("script[type='text/plain']").forEach(src => {
    const target = document.getElementById(src.id.replace("snippet", "code"));
    if (target) {
        target.textContent = src.textContent.trim();
        hljs.highlightElement(target); // apply highlighting
    }
});

// Copy button logic
function copyCode(button, codeId) {
    const code = document.getElementById(codeId).textContent;
    navigator.clipboard.writeText(code).then(() => {
        const original = button.textContent;
        button.textContent = "Copied!";
        button.classList.add("copied");
        setTimeout(() => {
            button.textContent = original;
            button.classList.remove("copied");
        }, 2000);
    });
}

document.addEventListener('DOMContentLoaded', initTheme);

window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],   // allow $...$ and \( ... \)
      displayMath: [['$$', '$$'], ['\\[', '\\]']] // allow $$...$$ and \[ ... \]
    },
    options: {
      renderActions: {
        addMenu: [0, '', ''] // removes right-click menu if unwanted
      }
    },
    svg: { fontCache: 'global' }
  };