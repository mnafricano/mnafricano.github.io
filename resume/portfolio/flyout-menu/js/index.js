(() => {
  const button = document.querySelector('.flyout-btn');
  const flyout = document.querySelector('.flyout');

  if (!button || !flyout) return;

  const items = flyout.querySelectorAll('a');

  button.addEventListener('click', (event) => {
    event.preventDefault();
    button.classList.toggle('btn-rotate');
    items.forEach((item) => item.className = '');
    flyout.classList.remove('flyout-init', 'fade');
    flyout.classList.toggle('expand');
  });

  items.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      button.classList.toggle('btn-rotate');
      flyout.classList.remove('expand');
      flyout.classList.add('fade');
      item.classList.add('clicked');
    });
  });
})();
