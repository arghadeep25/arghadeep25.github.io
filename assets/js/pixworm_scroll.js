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