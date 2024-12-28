document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('doodle-container');
    const numDots = 50; // Number of dots to animate
  
    for (let i = 0; i < numDots; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.style.left = `${Math.random() * 100}%`;
      dot.style.top = `${Math.random() * 100}%`;
      dot.style.animationDelay = `${Math.random() * 20}s`; // Stagger animation start times
      container.appendChild(dot);
    }
  });