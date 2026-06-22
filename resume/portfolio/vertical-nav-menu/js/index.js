(() => {
  const menuItems = document.querySelectorAll('.menu-item');

  menuItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();

      menuItems.forEach((link) => {
        link.classList.remove('is-selected');
        link.setAttribute('aria-current', 'false');
      });

      item.classList.add('is-selected');
      item.setAttribute('aria-current', 'page');
    });
  });
})();
