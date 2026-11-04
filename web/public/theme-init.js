(function () {
  try {
    var theme = localStorage.getItem('onebox-theme') || 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
})();
