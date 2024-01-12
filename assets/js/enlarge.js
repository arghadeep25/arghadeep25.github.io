let currentImageIndex = 0;
const galleryImages = document.querySelectorAll('.gallery-image');
const viewerOverlay = document.getElementById('viewerOverlay');
const viewerImage = document.getElementById('viewerImage');

function openViewer(clickedImage) {
    currentImageIndex = Array.from(galleryImages).indexOf(clickedImage);
    updateViewerImage();
    viewerOverlay.style.display = 'flex';
}

function closeViewer() {
    viewerOverlay.style.display = 'none';
}

function showNextImage() {
    currentImageIndex = (currentImageIndex + 1) % galleryImages.length;
    updateViewerImage();
}

function showPreviousImage() {
    currentImageIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;
    updateViewerImage();
}

function updateViewerImage() {
    const viewerImage = document.getElementById('viewerImage');
    viewerImage.src = galleryImages[currentImageIndex].src;
}

document.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') {
        showPreviousImage();
    } else if (event.key === 'ArrowRight') {
        showNextImage();
    } else if (event.key === 'Escape') {
        closeViewer();
    }
});

// Hammer.js for swipe gestures
const hammer = new Hammer(viewerOverlay);
hammer.on('swipeleft', showNextImage);
hammer.on('swiperight', showPreviousImage);

// viewerOverlay.addEventListener('click', function (event) {
//     // Close the viewer if clicked outside the image
//     if (event.currentTarget === event.target || event.target.classList.contains('viewer-overlay')) {
//         closeViewer();
//     }
// });

viewerOverlay.addEventListener('click', function (event) {
    // Close the viewer if clicked outside the image
    if (event.target === event.currentTarget) {
        closeViewer();
    }
});