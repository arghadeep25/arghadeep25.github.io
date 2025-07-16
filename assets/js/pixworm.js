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

document.querySelectorAll(".option").forEach(option => {
    option.addEventListener("click", () => {
        // Check if the clicked option is already active
        if (option.classList.contains("active")) {
            option.classList.remove("active"); // Remove active class if already active
        } else {
            // Remove active class from all options
            document.querySelectorAll(".option").forEach(opt => opt.classList.remove("active"));

            // Add active class to the clicked option
            option.classList.add("active");
        }
    });
});

const bg = document.getElementById('background-shrink');
const baseSize = 100;  // base background size in %
const zoomFactor = 0.05; // adjust zoom speed

window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    let newSize = baseSize + scrollY * zoomFactor;

    // Optional: Clamp zoom to prevent too much zoom in or out
    newSize = Math.max(100, Math.min(newSize, 200));

    bg.style.backgroundSize = `${newSize}%`;
});