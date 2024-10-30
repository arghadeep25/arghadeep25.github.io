const canvas = document.getElementById('stars-canvas');
const ctx = canvas.getContext('2d');
let stars = [];
const numStars = 350;
const connectionRadius = 120;
const starRadius = 1.1;
const maxConnections = 1;
const clusterRadius = Math.min(window.innerWidth, window.innerHeight) * 0.3;
const starVisibilityRadius = Math.min(window.innerWidth, window.innerHeight) * 0.6;

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

// canvas.addEventListener('mouseleave', () => {
//     mouse.x = null;
//     mouse.y = null;
// });

// Create stars with random movement, color, and initial connections
function generateStars() {
    stars = [];
    const maxAttempts = 5; // Limit attempts to avoid infinite loops

    for (let i = 0; i < numStars; i++) {
        let x, y, tooClose, attempts = 0;

        do {
            x = Math.random() * canvas.width;
            y = Math.random() * canvas.height;
            tooClose = stars.some(otherStar => distance(x, y, otherStar.x, otherStar.y) < connectionRadius);
            attempts++;
        } while (tooClose && attempts < maxAttempts);

        // Add the star regardless of spacing if max attempts reached
        stars.push({
            x: x,
            y: y,
            dx: (Math.random() - 0.5) * 0.5,
            dy: (Math.random() - 0.5) * 0.5,
            color: Math.random() < 0.5 ? 'rgba(0, 100, 255, 0.8)' : 'rgba(165, 42, 42, 0.8)',
            connections: 0
        });
    }
}


// Draw the stars and create connections
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    stars.forEach(star => {
        star.x += star.dx;
        star.y += star.dy;

        if (star.x < 0 || star.x > canvas.width) star.dx *= -1;
        if (star.y < 0 || star.y > canvas.height) star.dy *= -1;

        // Draw star
        ctx.beginPath();
        ctx.arc(star.x, star.y, starRadius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.fill();
        
        // Create connections either from initial cluster position or based on mouse hover
        if (isWithinCluster(star.x, star.y)) {
            createConnections(star);
        }
    });

    requestAnimationFrame(draw);
}

// Check if the star is within the cluster area, centered initially, and updating with mouse hover
function isWithinCluster(x, y) {
    const centerX = mouse.x || canvas.width / 2;
    const centerY = mouse.y || canvas.height / 2;
    return distance(centerX, centerY, x, y) < clusterRadius;
}

// Create limited connections for each star
function createConnections(star) {
    let connections = 0;
    stars.forEach(otherStar => {
        if (otherStar !== star && connections < maxConnections && star.connections < maxConnections) {
            if (distance(star.x, star.y, otherStar.x, otherStar.y) < connectionRadius) {
                ctx.beginPath();
                ctx.moveTo(star.x, star.y);
                ctx.lineTo(otherStar.x, otherStar.y);
                ctx.strokeStyle = 'rgba(80, 177, 255, 0.3)';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        }
    });
}

// Utility function to calculate distance between two points
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}


generateStars();
draw();
