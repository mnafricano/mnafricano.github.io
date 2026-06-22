  // Static audiobook controls. The MP3s live in /audio and are generated ahead of time with Piper.
  document.addEventListener('DOMContentLoaded', () => {
    let currentAudio = null;

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
  });
