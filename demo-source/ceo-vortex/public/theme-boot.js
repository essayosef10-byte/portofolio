// Apply the device's dark/light mode before React loads so there is no
// flash of the wrong theme.
;(function () {
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#07132f' : '#f4f7fc')
    }
  }
  try {
    localStorage.removeItem('ceo-theme')
  } catch (e) {
    /* localStorage unavailable */
  }
  var prefersDark =
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
})()
