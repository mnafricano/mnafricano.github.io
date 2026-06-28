(() => {
  const buttons = document.querySelectorAll('.navicon-button');
  const title = document.querySelector('.stage h2');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const isOpen = button.classList.toggle('open');
      button.setAttribute('aria-pressed', String(isOpen));
      title?.classList.add('fade');
    });
  });
})();
