import './global.css';
import './app.js';

const skip = document.createElement('a');
skip.href = '#main-content';
skip.className = 'skip-link';
skip.textContent = 'Skip to main content';
document.body.prepend(skip);
