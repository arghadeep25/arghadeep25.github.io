const canvas = document.getElementById('stars-canvas');
const ctx = canvas.getContext('2d');
let stars = [];
let numStars = 800; // Number of stars
let connectionRadius = 100; // Radius for connecting stars
let starRadius = 1; // Size of each star

// Resize the canvas to the full window
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.onresize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    generateStars();
};

// Store the mouse position
const mouse = { x: null, y: null };
canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.x;
    mouse.y = e.y;
});

canvas.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
});

// Create the stars
function generateStars() {
    stars = [];
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            dx: (Math.random() - 0.5) * 0.5, // Random small movement in x
            dy: (Math.random() - 0.5) * 0.5  // Random small movement in y
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw stars within the connection radius of the cursor
    if (mouse.x !== null && mouse.y !== null) {
        stars.forEach(star => {
            // Update star position with small random movement
            star.x += star.dx;
            star.y += star.dy;

            // Keep stars within canvas bounds
            if (star.x < 0 || star.x > canvas.width) star.dx *= -1; // Reverse direction if out of bounds
            if (star.y < 0 || star.y > canvas.height) star.dy *= -1; // Reverse direction if out of bounds

            // Draw star if within connection radius
            if (distance(mouse.x, mouse.y, star.x, star.y) < connectionRadius) {
                ctx.beginPath();
                ctx.arc(star.x, star.y, starRadius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.fill();
            }
        });

        // Draw lines between stars within the connection radius of the cursor
        stars.forEach(star => {
            if (distance(mouse.x, mouse.y, star.x, star.y) < connectionRadius) {
                stars.forEach(otherStar => {
                    if (otherStar !== star && distance(star.x, star.y, otherStar.x, otherStar.y) < connectionRadius) {
                        ctx.beginPath();
                        ctx.moveTo(star.x, star.y);
                        ctx.lineTo(otherStar.x, otherStar.y);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; // Subtle line effect
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                });
            }
        });
    }

    requestAnimationFrame(draw);
}

// Utility function to calculate the distance between two points
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

generateStars();
draw();
