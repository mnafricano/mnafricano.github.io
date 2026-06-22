(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let audioContext;
  let lastToneAt = 0;
  let cursorGlow;
  const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');

  const interactiveSelector = [
    'a[href]',
    'button',
    'input[type="button"]',
    'input[type="submit"]',
    '[role="button"]',
    'summary'
  ].join(',');

  const pathTo = (path) => {
    const base = document.querySelector('script[src$="site-effects.js"]')?.getAttribute('src') || 'site-effects.js';
    const depth = base.split('/').filter((part) => part === '..').length;
    return `${'../'.repeat(depth)}${path}`;
  };

  const isCurrent = (path) => {
    const normalized = path === './' ? '/' : `/${path.replace(/^\.\//, '').replace(/\/$/, '')}/`;
    return currentPath === normalized || (path === './' && currentPath.endsWith('/mnafricano.github.io/'));
  };

  const pageContext = () => {
    if (currentPath.includes('/resume/portfolio/')) {
      return [
        { href: pathTo('resume/'), label: 'Resume' },
        { href: pathTo('./'), label: 'Home' }
      ];
    }

    if (currentPath.includes('/resume/')) {
      return [
        { href: '#profile', label: 'Profile' },
        { href: '#work', label: 'Work' },
        { href: '#projects', label: 'Projects' },
        { href: '#contact', label: 'Contact' }
      ];
    }

    if (currentPath.includes('/super-book/')) {
      return [
        { href: '#part1', label: 'Contents' },
        { href: '#coda', label: 'Coda' },
        { href: pathTo('resume/'), label: 'Resume' }
      ];
    }

    return [
      { href: '#projects', label: 'Projects' },
      { href: pathTo('resume/'), label: 'Resume' },
      { href: pathTo('super-book/'), label: 'Book' }
    ];
  };

  const mountShell = () => {
    if (document.querySelector('.site-shell')) return;

    document.body.classList.add('has-site-shell');

    const shell = document.createElement('header');
    shell.className = 'site-shell';
    shell.innerHTML = `
      <a class="site-shell__brand" href="${pathTo('./')}" aria-label="Marcello Africano home">
        <span>MA</span>
        <strong>Marcello Africano</strong>
      </a>
      <nav class="site-shell__nav" aria-label="Persistent site navigation">
        ${pageContext().map((item) => `
          <a href="${item.href}" ${isCurrent(item.href) ? 'aria-current="page"' : ''}>${item.label}</a>
        `).join('')}
      </nav>
    `;

    document.body.prepend(shell);
  };

  const updateShellActiveLink = (id) => {
    if (!id) return;

    document.querySelectorAll('.site-shell__nav a[href^="#"]').forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
    });
  };

  const observeShellSections = () => {
    const shellHashLinks = [...document.querySelectorAll('.site-shell__nav a[href^="#"]')];
    if (!shellHashLinks.length || !('IntersectionObserver' in window)) return;

    const sectionIds = new Set(shellHashLinks.map((link) => link.getAttribute('href').slice(1)));
    const sections = [...document.querySelectorAll('[id]')].filter((section) => sectionIds.has(section.id));
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) updateShellActiveLink(entry.target.id);
      });
    }, {
      rootMargin: '-36% 0px -54% 0px',
      threshold: 0
    });

    sections.forEach((section) => observer.observe(section));
  };

  const mountShellStyles = () => {
    const shellStyle = document.createElement('style');
    shellStyle.textContent = `
      @view-transition {
        navigation: auto;
      }

      body.has-site-shell {
        --site-shell-height: 74px;
      }

      body.has-site-shell .site-header,
      body.has-site-shell .topbar {
        display: none !important;
      }

      .site-shell {
        position: fixed;
        top: 14px;
        left: 50%;
        z-index: 10000;
        width: min(1120px, calc(100% - 28px));
        min-height: 58px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 8px 10px;
        border: 1px solid rgba(245, 239, 231, 0.18);
        border-radius: 999px;
        background: rgba(12, 15, 18, 0.68);
        color: #f5efe7;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(18px);
        transform: translateX(-50%);
        view-transition-name: site-shell;
      }

      .site-shell__brand,
      .site-shell__nav,
      .site-shell__nav a {
        display: inline-flex;
        align-items: center;
      }

      .site-shell__brand {
        gap: 10px;
        min-width: 0;
        padding-right: 8px;
      }

      .site-shell__brand span {
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #f5efe7;
        color: #101214;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
      }

      .site-shell__brand strong {
        overflow: hidden;
        color: #f5efe7;
        font-size: 14px;
        font-weight: 780;
        line-height: 1.1;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .site-shell__nav {
        gap: 4px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .site-shell__nav a {
        min-height: 38px;
        padding: 0 12px;
        border-radius: 999px;
        color: rgba(245, 239, 231, 0.72);
        font-size: 13px;
        font-weight: 760;
      }

      .site-shell__nav a:hover,
      .site-shell__nav a:focus-visible,
      .site-shell__nav a[aria-current="page"],
      .site-shell__nav a.is-active {
        background: rgba(255, 255, 255, 0.1);
        color: #f5efe7;
        outline: none;
      }

      body.has-site-shell main,
      body.has-site-shell .cover,
      body.has-site-shell .demo-shell {
        view-transition-name: site-content;
      }

      body.site-is-leaving main,
      body.site-is-leaving .cover,
      body.site-is-leaving .toc-section,
      body.site-is-leaving .chapter,
      body.site-is-leaving .part-header,
      body.site-is-leaving .demo-shell {
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 180ms ease, transform 180ms ease;
      }

      @media (max-width: 640px) {
        .site-shell {
          align-items: flex-start;
          border-radius: 24px;
        }

        .site-shell__brand strong {
          max-width: 112px;
          white-space: normal;
        }

        .site-shell__nav a {
          min-height: 34px;
          padding: 0 9px;
          font-size: 12px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        body.site-is-leaving main,
        body.site-is-leaving .cover,
        body.site-is-leaving .toc-section,
        body.site-is-leaving .chapter,
        body.site-is-leaving .part-header,
        body.site-is-leaving .demo-shell {
          opacity: 1;
          transform: none;
          transition: none;
        }
      }
    `;

    document.head.appendChild(shellStyle);
  };

  mountShellStyles();
  mountShell();
  observeShellSections();

  const ensureAudio = () => {
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audioContext = new AudioContext();
    }

    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  };

  const toneFor = (target) => {
    const label = `${target.className || ''} ${target.textContent || ''}`.toLowerCase();

    if (label.includes('primary') || label.includes('open') || label.includes('explore')) {
      return { frequency: 560, second: 840, type: 'triangle' };
    }

    if (label.includes('resume') || label.includes('profile') || label.includes('contact')) {
      return { frequency: 420, second: 630, type: 'sine' };
    }

    if (label.includes('book') || label.includes('audio') || target.closest('.toc-section')) {
      return { frequency: 330, second: 495, type: 'sine' };
    }

    return { frequency: 480, second: 720, type: 'triangle' };
  };

  const playTone = (target) => {
    const now = performance.now();
    if (now - lastToneAt < 45) return;
    lastToneAt = now;

    const context = ensureAudio();
    if (!context) return;

    const tone = toneFor(target);
    const start = context.currentTime;
    const output = context.createGain();
    const filter = context.createBiquadFilter();

    output.gain.setValueAtTime(0.0001, start);
    output.gain.exponentialRampToValueAtTime(0.035, start + 0.012);
    output.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, start);
    filter.frequency.exponentialRampToValueAtTime(900, start + 0.16);

    [tone.frequency, tone.second].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(frequency, start + index * 0.018);
      oscillator.detune.setValueAtTime(index ? -6 : 4, start);
      oscillator.connect(filter);
      oscillator.start(start + index * 0.018);
      oscillator.stop(start + 0.17);
    });

    filter.connect(output);
    output.connect(context.destination);
  };

  const createRipple = (event) => {
    if (reduceMotion) return;

    const ripple = document.createElement('span');
    ripple.className = 'site-click-ripple';
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    document.body.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  };

  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest(interactiveSelector);
    if (!target || target.closest('[data-sound="off"]')) return;
    playTone(target);
    createRipple(event);
  }, { passive: true });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;

    const url = new URL(link.href, window.location.href);
    const samePageHash = url.pathname === window.location.pathname && url.hash;
    const internal = url.origin === window.location.origin;

    if (!internal || samePageHash || url.protocol.startsWith('mailto')) return;

    event.preventDefault();
    document.body.classList.add('site-is-leaving');
    window.setTimeout(() => {
      window.location.href = url.href;
    }, reduceMotion ? 0 : 170);
  });

  if (reduceMotion) return;

  const style = document.createElement('style');
  style.textContent = `
    .site-cursor-glow {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 9998;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle, rgba(88, 213, 196, 0.16), transparent 62%);
      mix-blend-mode: screen;
      opacity: 0;
      transform: translate3d(calc(var(--cursor-x, -999px) - 50%), calc(var(--cursor-y, -999px) - 50%), 0);
      transition: opacity 0.2s ease;
    }

    .site-click-ripple {
      position: fixed;
      z-index: 9999;
      width: 12px;
      height: 12px;
      border: 1px solid rgba(88, 213, 196, 0.82);
      border-radius: 50%;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(0.6);
      animation: site-ripple 520ms ease-out forwards;
    }

    @keyframes site-ripple {
      to {
        opacity: 0;
        transform: translate(-50%, -50%) scale(5.5);
      }
    }
  `;
  document.head.appendChild(style);

  cursorGlow = document.createElement('span');
  cursorGlow.className = 'site-cursor-glow';
  document.body.appendChild(cursorGlow);

  window.addEventListener('pointermove', (event) => {
    cursorGlow.style.setProperty('--cursor-x', `${event.clientX}px`);
    cursorGlow.style.setProperty('--cursor-y', `${event.clientY}px`);
    cursorGlow.style.opacity = '1';
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    cursorGlow.style.opacity = '0';
  });

  const parallaxItems = [...document.querySelectorAll('[data-parallax]')];
  if (!parallaxItems.length) return;

  const updateParallax = () => {
    const scrollY = window.scrollY || window.pageYOffset;

    parallaxItems.forEach((item) => {
      const depth = Number(item.dataset.parallax || 0);
      item.style.setProperty('--parallax-y', `${scrollY * depth}px`);
    });
  };

  updateParallax();
  window.addEventListener('scroll', updateParallax, { passive: true });
})();
