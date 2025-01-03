// Smooth scroll for links
document.querySelectorAll('nav ul li a').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Add an event listener for scroll
document.addEventListener("scroll", () => {
    const sections = document.querySelectorAll("section"); // All sections
    const navLinks = document.querySelectorAll("nav ul li a"); // All nav links

    let currentSection = "";

    // Identify the current section in the viewport
    sections.forEach((section) => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        if (window.scrollY >= sectionTop - 50 && window.scrollY < sectionTop + sectionHeight) {
            currentSection = section.getAttribute("id");
        }
    });

    // Remove active class from all links
    navLinks.forEach((link) => {
        link.classList.remove("active");

        // Add active class to the current section link
        if (link.getAttribute("href").includes(currentSection)) {
            link.classList.add("active");
        }
    });
});


// Change header background on scroll
window.addEventListener('scroll', function() {
    const header = document.getElementById('main-header');
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// Parallax Scrolling Effect
document.addEventListener("scroll", function() {
    const parallaxElements = document.querySelectorAll(".parallax");
    parallaxElements.forEach(function(element) {
        let scrollPosition = window.pageYOffset;
        let speed = element.getAttribute("data-speed");
        element.style.backgroundPositionY = `${scrollPosition * speed}px`;
    });
});

document.querySelector('.hamburger').addEventListener('click', function() {
    document.querySelector('nav ul').classList.toggle('show');
});


const drone = document.querySelector('.drone-image');

function randomFly() {
    const randomX = Math.random() * 100; // Random percentage for left
    const randomY = Math.random() * 20; // Random percentage for vertical movement
    drone.style.left = `${randomX}%`;
    drone.style.top = `${20 - randomY}%`; // Adjust starting height as needed
}

// // Change position every 2 seconds (2000 milliseconds)
// setInterval(() => {
//     const randomAnimation = Math.random() < 0.5 ? 'fly1' : 'fly2';
//     drone.style.animation = `${randomAnimation} 5s ease-in-out infinite`;
// }, 5000); // Change every 5 seconds


window.onload = function () {
    var typed = new Typed('.typed', {
        strings: document.querySelector('.typed').getAttribute('data-typed-items').split(','),
        typeSpeed: 20,
        backSpeed: 20,
        backDelay: 1000,
        loop: true
    });
};

document.querySelector('.scroll-down').addEventListener('click', function() {
    document.getElementById('next-section').scrollIntoView({ behavior: 'smooth' });
});


window.addEventListener('scroll', function() {
    const header = document.getElementById('main-header');
    const homeSection = document.getElementById('home');

    // Get the bottom position of the "Home" section
    const homeBottom = homeSection.getBoundingClientRect().bottom;

    if (window.scrollY > homeBottom) {
        header.classList.add('scrolled');  // Show header after "Home" section
    } else {
        header.classList.remove('scrolled'); // Hide header in "Home" section
    }
});

function updateCanvas() {
    const homeSection = document.getElementById('home');
    const starsCanvas = homeSection.querySelector('#stars-canvas');
    const backgroundStarsCanvas = homeSection.querySelector('#home-background-stars-canvas');

    // Change the canvas based on the window width
    if (window.innerWidth < 768) { // Adjust the threshold as needed
        starsCanvas.style.display = 'none';
        backgroundStarsCanvas.style.display = 'block';
    } else {
        starsCanvas.style.display = 'block';
        backgroundStarsCanvas.style.display = 'none';
    }
}

// Call the function on load and on resize
window.addEventListener('load', updateCanvas);
window.addEventListener('resize', updateCanvas);

let lastScrollPosition = 0;
const nav = document.querySelector('nav');

window.addEventListener('scroll', () => {
    const currentScrollPosition = window.pageYOffset;

    if (currentScrollPosition > lastScrollPosition) {
        nav.style.transform = 'translateY(-100%)';
        nav.style.display = 'none';
    } else {
        nav.style.transform = 'translateY(0)';
        nav.style.display = 'block';
    }

    lastScrollPosition = currentScrollPosition;
});