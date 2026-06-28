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
    const base = document.querySelector('script[src*="site-effects.js"]')?.getAttribute('src') || 'site-effects.js';
    const depth = base.split('/').filter((part) => part === '..').length;
    return `${'../'.repeat(depth)}${path}`;
  };

  const sectionForPath = () => {
    if (currentPath.includes('/resume/portfolio/')) return 'portfolio';
    if (currentPath.includes('/resume/')) return 'resume';
    if (currentPath.includes('/super-book/')) return 'book';
    if (currentPath.includes('/execution-engine/')) return 'engine';
    return 'home';
  };

  const isCurrent = (path, label = '') => {
    const section = sectionForPath();
    const href = path.replace(/^\.\//, '').replace(/\/$/, '');
    const normalizedLabel = label.toLowerCase();

    if (path.startsWith('#')) return false;
    if (section === 'home' && (path === './' || href === '')) return true;
    if (section === 'resume' && href === 'resume') return true;
    if (section === 'portfolio' && normalizedLabel === 'portfolio') return true;
    if (section === 'book' && href === 'super-book') return true;
    if (section === 'engine' && href === 'execution-engine') return true;
    return false;
  };

  const pageContext = () => {
    if (currentPath.includes('/resume/portfolio/')) {
      return [
        { href: pathTo('resume/#projects'), label: 'Portfolio' },
        { href: '#demo', label: 'Demo' },
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
        { href: pathTo('./'), label: 'Home' },
        { href: '#contents', label: 'Contents' },
        { href: '#coda', label: 'Coda' },
        { href: pathTo('resume/'), label: 'Resume' }
      ];
    }

    if (currentPath.includes('/execution-engine/')) {
      return [
        { href: pathTo('./'), label: 'Home' },
        { href: '#dashboard', label: 'Dashboard' },
        { href: '#principles', label: 'Principles' },
        { href: pathTo('super-book/'), label: 'Book' }
      ];
    }

    return [
      { href: '#projects', label: 'Projects' },
      { href: pathTo('resume/'), label: 'Resume' },
      { href: pathTo('execution-engine/'), label: 'Engine' },
      { href: pathTo('super-book/'), label: 'Book' }
    ];
  };

  const mountShell = () => {
    if (document.querySelector('.site-shell')) return;

    document.body.classList.add('has-site-shell', 'site-booting');
    const main = document.querySelector('main, .cover');
    if (main && !main.id) main.id = 'main';

    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#main';
    skip.textContent = 'Skip to main content';

    const shell = document.createElement('header');
    shell.className = 'site-shell';
    shell.innerHTML = `
      <a class="site-shell__brand" href="${pathTo('./')}" aria-label="Marcello Africano home">
        <span>MA</span>
        <strong>Marcello Africano</strong>
      </a>
      <nav class="site-shell__nav" aria-label="Persistent site navigation">
        ${pageContext().map((item) => `
          <a href="${item.href}" ${isCurrent(item.href, item.label) ? 'aria-current="page"' : ''}>${item.label}</a>
        `).join('')}
      </nav>
    `;

    document.body.prepend(skip);
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

      :where(a, button, input, textarea, select, summary, [tabindex]):focus-visible {
        outline: 2px solid rgba(88, 213, 196, 0.92) !important;
        outline-offset: 4px !important;
      }

      .skip-link {
        position: fixed;
        top: 18px;
        left: 50%;
        z-index: 10001;
        padding: 12px 16px;
        border-radius: 999px;
        background: #f5efe7;
        color: #101214;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        font-weight: 850;
        text-decoration: none;
        transform: translate(-50%, -240%);
        transition: transform 160ms ease;
      }

      .skip-link:focus-visible {
        transform: translate(-50%, 0);
      }

      body.has-site-shell {
        --site-shell-height: 74px;
      }

      body.has-site-shell .site-header,
      body.has-site-shell .topbar {
        display: none !important;
      }

      .site-shell {
        box-sizing: border-box !important;
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
        border: 1px solid rgba(245, 239, 231, 0.16);
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(23, 25, 27, 0.96), rgba(14, 16, 18, 0.96));
        color: #f5efe7;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        font-size: 14px !important;
        font-style: normal !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
        line-height: 1 !important;
        text-align: left !important;
        text-transform: none !important;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.3);
        -webkit-backdrop-filter: blur(18px) saturate(1.12);
        backdrop-filter: blur(18px);
        transform: translateX(-50%);
        isolation: isolate;
        opacity: 1;
        view-transition-name: site-shell;
      }

      .site-shell,
      .site-shell *,
      .site-shell *::before,
      .site-shell *::after {
        box-sizing: border-box !important;
      }

      .site-shell__brand,
      .site-shell__nav a {
        appearance: none !important;
        border: 0 !important;
        box-shadow: none !important;
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        font-family: inherit !important;
        font-style: normal !important;
        line-height: 1 !important;
        margin: 0 !important;
        text-decoration: none !important;
        text-shadow: none !important;
        text-transform: none !important;
      }

      .site-shell__brand,
      .site-shell__brand:hover,
      .site-shell__brand:visited,
      .site-shell__nav a,
      .site-shell__nav a:hover,
      .site-shell__nav a:visited {
        color: inherit !important;
      }

      .site-shell__brand {
        gap: 10px;
        min-width: 0;
        padding-right: 8px;
        background: transparent !important;
        cursor: pointer;
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
        line-height: 1 !important;
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
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        justify-content: flex-end;
        margin: 0 !important;
        padding: 0 !important;
      }

      .site-shell__nav a {
        min-height: 38px;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        border-radius: 999px;
        color: rgba(245, 239, 231, 0.72);
        font-size: 13px;
        font-weight: 760;
        letter-spacing: 0 !important;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
      }

      .site-shell__nav a:hover,
      .site-shell__nav a:focus-visible,
      .site-shell__nav a[aria-current="page"],
      .site-shell__nav a.is-active {
        background: rgba(255, 255, 255, 0.1);
        color: #f5efe7;
        outline: none;
      }

      body.site-booting .site-shell {
        opacity: 0;
        transform: translateX(-50%) translateY(-18px) scale(0.96);
      }

      body.site-loaded .site-shell {
        animation: site-shell-enter 720ms cubic-bezier(.16, 1, .3, 1) both;
      }

      @keyframes site-shell-enter {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-18px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
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
          align-items: center;
          left: 10px;
          right: 10px;
          width: auto;
          min-height: 56px;
          border-radius: 999px;
          gap: 8px;
          padding: 8px 9px;
          transform: none;
        }

        body.site-booting .site-shell {
          transform: translateY(-18px) scale(0.96);
        }

        body.site-loaded .site-shell {
          animation: site-shell-enter-mobile 720ms cubic-bezier(.16, 1, .3, 1) both;
        }

        @keyframes site-shell-enter-mobile {
          from {
            opacity: 0;
            transform: translateY(-18px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .site-shell__brand strong {
          display: none;
        }

        .site-shell__brand {
          flex: 0 0 auto;
          padding-right: 0;
        }

        .site-shell__brand span {
          width: 38px;
          height: 38px;
        }

        .site-shell__nav {
          flex: 1;
          flex-wrap: nowrap;
          overflow-x: auto;
          justify-content: flex-start;
          scrollbar-width: none;
        }

        .site-shell__nav::-webkit-scrollbar {
          display: none;
        }

        .site-shell__nav a {
          min-height: 34px;
          flex: 0 0 auto;
          padding: 0 10px;
          font-size: 12px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        @view-transition {
          navigation: none;
        }

        body.site-booting .site-shell,
        body.site-loaded .site-shell {
          opacity: 1;
          animation: none;
          transform: translateX(-50%);
        }

        @media (max-width: 640px) {
          body.site-booting .site-shell,
          body.site-loaded .site-shell {
            transform: none;
          }
        }

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

  const bootSite = () => {
    requestAnimationFrame(() => {
      document.body.classList.remove('site-booting');
      document.body.classList.add('site-loaded');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSite, { once: true });
  } else {
    bootSite();
  }

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

    const burst = document.createElement('span');
    burst.className = 'site-click-burst';
    burst.style.left = `${event.clientX}px`;
    burst.style.top = `${event.clientY}px`;
    burst.innerHTML = Array.from({ length: 10 }, (_, index) => `<i style="--ray:${index};"></i>`).join('');
    document.body.appendChild(burst);
    burst.addEventListener('animationend', () => burst.remove(), { once: true });
  };

  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest(interactiveSelector);
    if (!target || target.closest('[data-sound="off"]')) return;
    playTone(target);
    createRipple(event);
  }, { passive: true });

  document.addEventListener('click', (event) => {
    if (reduceMotion) return;
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
    .site-stage-light {
      position: fixed;
      inset: 0;
      z-index: 9997;
      pointer-events: none;
      background:
        radial-gradient(circle at var(--spot-x, 50%) var(--spot-y, 35%), rgba(88, 213, 196, 0.13), transparent 20rem),
        radial-gradient(circle at calc(100% - var(--spot-x, 50%)) calc(100% - var(--spot-y, 35%)), rgba(211, 154, 74, 0.11), transparent 24rem),
        linear-gradient(180deg, rgba(255,255,255,calc(var(--scroll-glow, 0) * 0.04)), transparent 42%);
      mix-blend-mode: screen;
      opacity: 0.78;
    }

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

    .site-click-burst {
      position: fixed;
      z-index: 10001;
      left: 0;
      top: 0;
      width: 1px;
      height: 1px;
      pointer-events: none;
      animation: site-burst-fade 760ms ease-out forwards;
    }

    .site-click-burst i {
      position: absolute;
      left: 0;
      top: 0;
      width: 2px;
      height: 34px;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(245,239,231,0.95), rgba(88,213,196,0));
      transform-origin: 50% 100%;
      transform: rotate(calc(var(--ray) * 36deg)) translateY(-16px) scaleY(0.4);
      animation: site-burst-ray 760ms cubic-bezier(.16, 1, .3, 1) forwards;
    }

    @keyframes site-ripple {
      to {
        opacity: 0;
        transform: translate(-50%, -50%) scale(5.5);
      }
    }

    @keyframes site-burst-fade {
      to { opacity: 0; }
    }

    @keyframes site-burst-ray {
      to {
        transform: rotate(calc(var(--ray) * 36deg)) translateY(-78px) scaleY(1);
      }
    }

    .site-reveal {
      opacity: 0;
      filter: blur(10px);
      transform: translate3d(0, 42px, 0) scale(0.98);
      transition:
        opacity 900ms cubic-bezier(.16, 1, .3, 1),
        filter 900ms cubic-bezier(.16, 1, .3, 1),
        transform 900ms cubic-bezier(.16, 1, .3, 1);
      transition-delay: var(--reveal-delay, 0ms);
      will-change: opacity, filter, transform;
    }

    .site-reveal.is-visible {
      opacity: 1;
      filter: blur(0);
      transform: translate3d(0, 0, 0) scale(1);
    }

    .site-reveal[data-reveal-kind="hero"] {
      transform: translate3d(0, 62px, 0) scale(0.94);
      transition-duration: 1100ms;
    }

    .site-reveal[data-reveal-kind="panel"] {
      transform: translate3d(0, 54px, 0) rotateX(8deg) scale(0.96);
      transform-origin: 50% 80%;
    }

    .site-magnetic {
      transform: translate3d(var(--magnet-x, 0), var(--magnet-y, 0), 0) scale(var(--magnet-scale, 1));
      transition: transform 220ms cubic-bezier(.16, 1, .3, 1), box-shadow 220ms ease, background-color 180ms ease;
      will-change: transform;
    }

    .site-magnetic:hover {
      --magnet-scale: 1.035;
    }

    body.site-is-leaving::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 10002;
      pointer-events: none;
      background:
        radial-gradient(circle at var(--spot-x, 50%) var(--spot-y, 40%), rgba(88,213,196,0.2), transparent 22rem),
        rgba(8, 10, 12, 0.42);
      animation: site-curtain 180ms ease forwards;
    }

    @keyframes site-curtain {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  const stageLight = document.createElement('span');
  stageLight.className = 'site-stage-light';
  document.body.appendChild(stageLight);

  cursorGlow = document.createElement('span');
  cursorGlow.className = 'site-cursor-glow';
  document.body.appendChild(cursorGlow);

  const setSpot = (x, y) => {
    const spotX = `${(x / window.innerWidth) * 100}%`;
    const spotY = `${(y / window.innerHeight) * 100}%`;
    document.documentElement.style.setProperty('--spot-x', spotX);
    document.documentElement.style.setProperty('--spot-y', spotY);
  };

  window.addEventListener('pointermove', (event) => {
    cursorGlow.style.setProperty('--cursor-x', `${event.clientX}px`);
    cursorGlow.style.setProperty('--cursor-y', `${event.clientY}px`);
    cursorGlow.style.opacity = '1';
    setSpot(event.clientX, event.clientY);
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    cursorGlow.style.opacity = '0';
  });

  const revealSelector = [
    '.hero-copy',
    '.project-showcase',
    '.project-card',
    '.section-heading',
    '.hero-section .hero-copy',
    '.identity-card',
    '.experience-card',
    '.skills-strip',
    '.project-panel',
    '.contact-card',
    '.cover-title',
    '.cover-subtitle',
    '.toc-inner',
    '.toc-entry',
    '.part-header',
    '.chapter',
    '.demo-shell',
    '.demo-stage',
    'main > section'
  ].join(',');

  const revealItems = [...new Set([...document.querySelectorAll(revealSelector)])]
    .filter((item) => !item.closest('.site-shell'));

  revealItems.forEach((item, index) => {
    item.classList.add('site-reveal');
    item.style.setProperty('--reveal-delay', `${Math.min(index % 8, 5) * 70}ms`);

    if (item.matches('.hero-copy, .cover-title, .hero-section .hero-copy')) {
      item.dataset.revealKind = 'hero';
    } else if (item.matches('.project-showcase, .project-card, .identity-card, .experience-card, .toc-inner, .chapter, .demo-shell, .demo-stage')) {
      item.dataset.revealKind = 'panel';
    }
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, {
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.08
  });

  revealItems.forEach((item) => revealObserver.observe(item));

  const magneticItems = [...document.querySelectorAll('.button, .site-shell__nav a, .site-shell__brand, .project-link, .toc-entry')];
  magneticItems.forEach((item) => {
    item.classList.add('site-magnetic');
    item.addEventListener('pointermove', (event) => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      item.style.setProperty('--magnet-x', `${x * 0.12}px`);
      item.style.setProperty('--magnet-y', `${y * 0.18}px`);
    });
    item.addEventListener('pointerleave', () => {
      item.style.setProperty('--magnet-x', '0px');
      item.style.setProperty('--magnet-y', '0px');
    });
  });

  const parallaxItems = [...document.querySelectorAll('[data-parallax]')];

  const updateParallax = () => {
    const scrollY = window.scrollY || window.pageYOffset;
    const doc = document.documentElement;
    const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, scrollY / maxScroll));

    document.documentElement.style.setProperty('--scroll-glow', progress.toFixed(3));

    parallaxItems.forEach((item) => {
      const depth = Number(item.dataset.parallax || 0);
      item.style.setProperty('--parallax-y', `${scrollY * depth}px`);
    });
  };

  updateParallax();
  window.addEventListener('scroll', updateParallax, { passive: true });
})();
