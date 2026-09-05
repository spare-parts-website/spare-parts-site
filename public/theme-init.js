(() => {
  try {
    const stored = window.localStorage.getItem('theme')
    const dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
  } catch {
    // Keep the server-rendered light theme if storage or matchMedia is blocked.
  }
})()
