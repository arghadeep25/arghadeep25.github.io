const canvasBackground = document.getElementById('background-stars-canvas');
    const ctxBackground = canvasBackground.getContext('2d');
    let backgroundStars = [];
    let numBackgroundStars = 50; // Fewer stars for background
    let backgroundStarRadius = 1.5; // Slightly larger stars for visibility

    // Resize canvas to full window size
    canvasBackground.width = window.innerWidth;
    canvasBackground.height = window.innerHeight;

    window.onresize = () => {
        canvasBackground.width = window.innerWidth;
        canvasBackground.height = window.innerHeight;
        generateBackgroundStars();
    };

    // Create fewer stars for background effect
    function generateBackgroundStars() {
        backgroundStars = [];
        for (let i = 0; i < numBackgroundStars; i++) {
            backgroundStars.push({
                x: Math.random() * canvasBackground.width,
                y: Math.random() * canvasBackground.height,
                dx: (Math.random() - 0.5) * 0.2, // Slower movement
                dy: (Math.random() - 0.5) * 0.2, // Slower movement
                color: Math.random() < 0.5 ? 'rgba(0, 100, 255, 0.6)' : 'rgba(165, 42, 42, 0.6)' // White and purple-red stars
            });
        }
    }

    function drawBackground() {
        ctxBackground.clearRect(0, 0, canvasBackground.width, canvasBackground.height);

        // Draw roaming stars
        backgroundStars.forEach(star => {
            star.x += star.dx;
            star.y += star.dy;

            // Keep stars within canvas bounds
            if (star.x < 0 || star.x > canvasBackground.width) star.dx *= -1;
            if (star.y < 0 || star.y > canvasBackground.height) star.dy *= -1;

            // Draw each star
            ctxBackground.beginPath();
            ctxBackground.arc(star.x, star.y, backgroundStarRadius, 0, Math.PI * 2);
            ctxBackground.fillStyle = star.color;
            ctxBackground.fill();
        });

        requestAnimationFrame(drawBackground);
    }

    generateBackgroundStars();
    drawBackground();