const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

if (!prefersReducedMotion) {
    const planes = document.querySelectorAll('[data-depth]');
    const marquee = document.querySelector('[data-marquee]');

    const updateScrollMotion = () => {
        const scrollY = window.scrollY;

        planes.forEach((plane) => {
            const depth = Number(plane.dataset.depth || 0);
            plane.style.setProperty('--parallax-y', `${scrollY * depth}px`);
        });

        if (marquee) {
            marquee.style.setProperty('--marquee-x', `${-scrollY * 0.18}px`);
        }
    };

    updateScrollMotion();
    window.addEventListener('scroll', updateScrollMotion, { passive: true });

    document.querySelectorAll('[data-tilt]').forEach((card) => {
        card.addEventListener('pointermove', (event) => {
            const rect = card.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            const rotateY = clamp((x - 0.5) * 12, -7, 7);
            const rotateX = clamp((0.5 - y) * 12, -7, 7);

            card.style.setProperty('--rx', `${rotateX}deg`);
            card.style.setProperty('--ry', `${rotateY}deg`);
        });

        card.addEventListener('pointerleave', () => {
            card.style.setProperty('--rx', '0deg');
            card.style.setProperty('--ry', '0deg');
        });
    });
}

const sections = document.querySelectorAll('[data-section]');
const navLinks = document.querySelectorAll('.section-nav a');

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        navLinks.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
        });
    });
}, {
    rootMargin: '-38% 0px -52% 0px',
    threshold: 0
});

sections.forEach((section) => observer.observe(section));
