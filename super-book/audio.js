  // Static audiobook controls. The MP3s live in /audio and are generated ahead of time with Piper.
  document.addEventListener('DOMContentLoaded', () => {
    let currentAudio = null;
    const progress = document.querySelector('[data-reading-progress]');
    const continueLink = document.querySelector('[data-continue-reading]');
    const storageKey = 'super-book-continue-section';
    const sections = [...document.querySelectorAll('.part-header[id], hr[id], .chapter-title')]
      .map((node) => {
        const heading = node.classList.contains('chapter-title') ? node : node.querySelector?.('.part-title');
        const id = node.id || heading?.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!node.id && id) node.id = id;
        return {
          id: node.id,
          title: heading?.textContent?.trim() || node.textContent.trim()
        };
      })
      .filter((section) => section.id && section.title);

    const readerNav = document.createElement('aside');
    readerNav.className = 'reader-nav';
    readerNav.setAttribute('aria-label', 'Reading position');
    readerNav.innerHTML = '<small>Now reading</small><a href="#contents" data-reader-current>Contents</a>';
    document.body.appendChild(readerNav);
    const currentSectionLink = readerNav.querySelector('[data-reader-current]');

    const updateProgress = () => {
      if (!progress) return;
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const percent = Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
      progress.style.width = `${percent}%`;
    };

    const setContinue = (id, title) => {
      if (!id || !continueLink) return;
      localStorage.setItem(storageKey, JSON.stringify({ id, title }));
      continueLink.href = `#${id}`;
      continueLink.textContent = `Continue: ${title}`;
      currentSectionLink.href = `#${id}`;
      currentSectionLink.textContent = title;

      document.querySelectorAll('.toc-entry').forEach((link) => {
        link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
      });
    };

    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved?.id && saved?.title) setContinue(saved.id, saved.title);
    } catch (error) {
      localStorage.removeItem(storageKey);
    }

    document.querySelectorAll('.chapter-audio').forEach((audio) => {
      audio.addEventListener('play', () => {
        if (currentAudio && currentAudio !== audio) currentAudio.pause();
        currentAudio = audio;
      });

      audio.addEventListener('error', () => {
        const warning = audio.closest('.audio-panel').querySelector('.audio-missing');
        if (warning) warning.style.display = 'block';
      });
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        const section = sections.find((item) => item.id === visible.target.id);
        if (section) setContinue(section.id, section.title);
      }, {
        rootMargin: '-30% 0px -58% 0px',
        threshold: [0, 0.4, 0.8]
      });

      sections.forEach((section) => {
        const target = document.getElementById(section.id);
        if (target) observer.observe(target);
      });
    }

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
  });
