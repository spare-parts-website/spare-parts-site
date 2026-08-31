'use client'

import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AuthUser } from '@/lib/store'

type AssistantProps = {
  user: AuthUser | null
  initiallyOpen?: boolean
  initialPrompt?: string
}

let assistantPromise: Promise<ComponentType<AssistantProps>> | undefined

function loadAssistant() {
  assistantPromise ??= import('@/components/ai-assistant').then((module) => module.AIAssistant)
  return assistantPromise
}

export function AIAssistantLoader({ user }: { user: AuthUser | null }) {
  const [requested, setRequested] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState('')
  const [Assistant, setAssistant] = useState<ComponentType<AssistantProps> | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const requestAssistant = useCallback((prompt = '') => {
    setInitialPrompt(prompt)
    setRequested(true)
    setLoadFailed(false)
    void loadAssistant()
      .then((component) => setAssistant(() => component))
      .catch(() => {
        assistantPromise = undefined
        setRequested(false)
        setLoadFailed(true)
      })
  }, [])

  useEffect(() => {
    if (Assistant) return
    const openFromPage = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail
      requestAssistant(typeof detail?.prompt === 'string' ? detail.prompt : '')
    }
    window.addEventListener('ghyar-ai-open', openFromPage)
    return () => window.removeEventListener('ghyar-ai-open', openFromPage)
  }, [Assistant, requestAssistant])

  if (Assistant) {
    return <Assistant user={user} initiallyOpen initialPrompt={initialPrompt} />
  }

  return (
    <Button
      className="fixed bottom-24 left-4 z-40 h-12 rounded-2xl px-4 shadow-xl lg:bottom-6"
      aria-label={requested ? 'جاري فتح مساعد غيار ماركت' : 'فتح مساعد غيار ماركت'}
      onClick={() => requestAssistant()}
      disabled={requested}
    >
      {requested ? <Loader2 className="ml-2 size-5 animate-spin" /> : <Sparkles className="ml-2 size-5" />}
      {requested ? 'جاري الفتح...' : loadFailed ? 'حاول فتح المساعد مجدداً' : 'اسأل غيار'}
    </Button>
  )
}
