let slideIndex = 0;
const slides = document.querySelectorAll('.slides');
const dots = document.querySelectorAll('.dot');
const interval = 5000; // 5 seconds
let slideTimer;

function showSlides(n) {
    slides.forEach(s => s.style.display = 'none');
    dots.forEach(d => d.classList.remove('active-dot'));

    slideIndex = n;
    if (slideIndex >= slides.length) slideIndex = 0;
    if (slideIndex < 0) slideIndex = slides.length - 1;

    slides[slideIndex].style.display = 'block';
    dots[slideIndex].classList.add('active-dot');
}

function autoSlides() {
    slideIndex++;
    showSlides(slideIndex);
    slideTimer = setTimeout(autoSlides, interval);
}

dots.forEach(dot => {
    dot.addEventListener('click', () => {
        clearTimeout(slideTimer);
        showSlides(parseInt(dot.getAttribute('data-index')));
        slideTimer = setTimeout(autoSlides, interval);
    });
});

showSlides(slideIndex);
slideTimer = setTimeout(autoSlides, interval);

// Shrink background on scroll
window.addEventListener('scroll', () => {
    const bg = document.getElementById('background-shrink');
    if (window.scrollY > 100) {
        bg.classList.add('shrinked');
    } else {
        bg.classList.remove('shrinked');
    }
});

// Dark/Light Mode Toggle
const toggle = document.querySelector('.theme-toggle');
if (toggle) {
    toggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');
    });
}

// Default theme
document.documentElement.setAttribute('data-theme', 'light');