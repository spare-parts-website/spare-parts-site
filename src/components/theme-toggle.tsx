'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

function applyTheme(dark: boolean) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setIsDark(root.classList.contains('dark'))
    const onSystemChange = () => {
      const stored = window.localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') return
      applyTheme(media.matches)
      sync()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'theme') return
      const stored = window.localStorage.getItem('theme')
      const dark = stored === 'dark' || (stored !== 'light' && media.matches)
      applyTheme(dark)
      sync()
    }

    sync()
    media.addEventListener('change', onSystemChange)
    window.addEventListener('storage', onStorage)
    return () => {
      media.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const toggle = () => {
    const dark = !document.documentElement.classList.contains('dark')
    applyTheme(dark)
    window.localStorage.setItem('theme', dark ? 'dark' : 'light')
    setIsDark(dark)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9 relative"
      onClick={toggle}
      title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
      aria-pressed={isDark}
    >
      <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">تبديل الوضع</span>
    </Button>
  )
}
