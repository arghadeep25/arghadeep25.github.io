window.addEventListener('DOMContentLoaded', () => {
    const images = document.querySelectorAll('.masonry-img');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.querySelector('.close');
    const nextBtn = document.querySelector('.next');
    const prevBtn = document.querySelector('.prev');

    let currentIndex = -1; // start at -1 so no image is selected initially

    function showLightbox(index) {
        currentIndex = index;
        lightbox.style.display = "flex";
        lightboxImg.src = images[currentIndex].src;
    }

    images.forEach((img, idx) => {
        img.addEventListener('click', () => {
            showLightbox(idx);
        });
    });

    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        lightbox.style.display = "none";
        lightboxImg.src = ""; // Reset the src when closing to avoid rendering issues
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

    document.addEventListener('keydown', (e) => {
        if (lightbox.style.display === "flex") {
            if (e.key === "ArrowRight") nextBtn.click();
            if (e.key === "ArrowLeft") prevBtn.click();
            if (e.key === "Escape") closeBtn.click();
        }
    });
});
