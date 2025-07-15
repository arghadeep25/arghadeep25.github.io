const images = document.querySelectorAll('.masonry-img');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const closeBtn = document.querySelector('.close');
const nextBtn = document.querySelector('.next');
const prevBtn = document.querySelector('.prev');

let currentIndex = 0;

function showLightbox(index) {
    currentIndex = index;
    lightbox.style.display = "block";
    lightboxImg.src = images[currentIndex].src;
}

images.forEach((img, idx) => {
    img.addEventListener('click', () => {
        showLightbox(idx);
    });
});

closeBtn.addEventListener('click', () => {
    lightbox.style.display = "none";
});

nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentIndex = (currentIndex + 1) % images.length;
    lightboxImg.src = images[currentIndex].src;
});

prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    lightboxImg.src = images[currentIndex].src;
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (lightbox.style.display === "block") {
        if (e.key === "ArrowRight") nextBtn.click();
        if (e.key === "ArrowLeft") prevBtn.click();
        if (e.key === "Escape") closeBtn.click();
    }
});
