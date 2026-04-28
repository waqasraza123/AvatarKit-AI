"use client"

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KioskPublicConfig, KioskSessionResponse } from "@/lib/kiosk"

type TranscriptMessage = {
  id: string
  role: "visitor" | "avatar" | "system"
  content: string
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: {
    transcript: string
  }
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

type KioskErrorResponse = {
  status?: string
  code?: string
  message?: string
}

type LeadCapturePrompt = {
  required: boolean
  reason: string | null
  fields: string[]
  promptText: string | null
}

type LeadFormState = {
  name: string
  email: string
  phone: string
  message: string
}

function createVisitorId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const errorPayload = payload as KioskErrorResponse | null
    throw new Error(errorPayload?.message ?? "Kiosk request failed.")
  }

  return payload as T
}

export function KioskExperience({ config }: { config: KioskPublicConfig }) {
  const [session, setSession] = useState<KioskSessionResponse | null>(null)
  const [visitorId] = useState(createVisitorId)
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [idle, setIdle] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [lastActivity, setLastActivity] = useState(() => Date.now())
  const [leadPrompt, setLeadPrompt] = useState<LeadCapturePrompt | null>(null)
  const [leadForm, setLeadForm] = useState<LeadFormState>({
    name: "",
    email: "",
    phone: "",
    message: ""
  })
  const [leadStatus, setLeadStatus] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const sessionRef = useRef<KioskSessionResponse | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    const Recognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
    setVoiceSupported(Boolean(Recognition))
  }, [])

  const markActivity = useCallback(() => {
    setLastActivity(Date.now())
    setIdle(false)
  }, [])

  const endSession = useCallback(async (activeSession: KioskSessionResponse | null) => {
    if (!activeSession) {
      return
    }

    await fetch(`/api/kiosk/${config.avatarId}/sessions/${activeSession.conversationId}/end`, {
      method: "POST"
    }).catch(() => undefined)
  }, [config.avatarId])

  const resetSession = useCallback(async () => {
    const activeSession = sessionRef.current
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setListening(false)
    setBusy(false)
    setInput("")
    setError(null)
    setMessages([])
    setLeadPrompt(null)
    setLeadStatus(null)
    setLeadForm({
      name: "",
      email: "",
      phone: "",
      message: ""
    })
    setSession(null)
    setIdle(true)
    setLastActivity(Date.now())
    await endSession(activeSession)
  }, [endSession])

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) {
      return sessionRef.current
    }

    const response = await fetch(`/api/kiosk/${config.avatarId}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorId })
    })
    const created = await parseJsonResponse<KioskSessionResponse>(response)
    setSession(created)
    sessionRef.current = created
    return created
  }, [config.avatarId, visitorId])

  const sendMessage = useCallback(async (messageText: string) => {
    const trimmed = messageText.trim()
    if (!trimmed || busy) {
      return
    }

    markActivity()
    setBusy(true)
    setError(null)
    setInput("")
    const visitorMessage: TranscriptMessage = {
      id: createVisitorId(),
      role: "visitor",
      content: trimmed
    }
    setMessages(current => [...current, visitorMessage])

    try {
      const activeSession = await ensureSession()
      const response = await fetch(`/api/kiosk/${config.avatarId}/sessions/${activeSession.conversationId}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      })
      const result = await parseJsonResponse<{
        avatarMessage: { id: string; content: string; leadCapture: LeadCapturePrompt }
      }>(response)
      setMessages(current => [
        ...current,
        {
          id: result.avatarMessage.id,
          role: "avatar",
          content: result.avatarMessage.content
        }
      ])
      if (result.avatarMessage.leadCapture.required) {
        setLeadPrompt(result.avatarMessage.leadCapture)
        setLeadForm(current => ({
          ...current,
          message: current.message || trimmed
        }))
      }
    } catch (requestError) {
      const requestMessage = requestError instanceof Error ? requestError.message : "Kiosk message failed."
      setError(requestMessage)
      setMessages(current => [
        ...current,
        {
          id: createVisitorId(),
          role: "system",
          content: requestMessage
        }
      ])
    } finally {
      setBusy(false)
      setLastActivity(Date.now())
    }
  }, [busy, config.avatarId, ensureSession, markActivity])

  const startVoiceInput = useCallback(() => {
    if (busy || listening) {
      return
    }

    const Recognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
    if (!Recognition) {
      setError("Voice input is unavailable on this device.")
      return
    }

    markActivity()
    setError(null)
    const recognition = new Recognition()
    recognition.lang = config.allowedLanguage ?? "en-US"
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = event => {
      const transcript = Array.from(event.results)
        .filter(result => result.isFinal)
        .map(result => result[0]?.transcript ?? "")
        .join(" ")
        .trim()

      if (transcript) {
        setInput(transcript)
        void sendMessage(transcript)
      }
    }
    recognition.onerror = event => {
      setError(event.error ? `Voice input failed: ${event.error}.` : "Voice input failed.")
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }, [busy, config.allowedLanguage, listening, markActivity, sendMessage])

  useEffect(() => {
    const onActivity = () => markActivity()
    window.addEventListener("pointerdown", onActivity)
    window.addEventListener("keydown", onActivity)
    return () => {
      window.removeEventListener("pointerdown", onActivity)
      window.removeEventListener("keydown", onActivity)
    }
  }, [markActivity])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - lastActivity) / 1000
      if (sessionRef.current && elapsedSeconds >= config.privacyTimeoutSeconds) {
        void resetSession()
        return
      }

      if (!idle && elapsedSeconds >= config.inactivityTimeoutSeconds) {
        setIdle(true)
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [config.inactivityTimeoutSeconds, config.privacyTimeoutSeconds, idle, lastActivity, resetSession])

  useEffect(() => () => {
    recognitionRef.current?.abort()
    void endSession(sessionRef.current)
  }, [endSession])

  const statusLabel = useMemo(() => {
    if (busy) {
      return "Thinking"
    }

    if (listening) {
      return "Listening"
    }

    if (session) {
      return "Active"
    }

    return "Ready"
  }, [busy, listening, session])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(input)
  }

  async function handleLeadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sessionRef.current || busy) {
      return
    }

    setBusy(true)
    setLeadStatus(null)
    setError(null)

    try {
      const response = await fetch(`/api/kiosk/${config.avatarId}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: sessionRef.current.conversationId,
          ...leadForm
        })
      })
      await parseJsonResponse(response)
      setLeadPrompt(null)
      setLeadStatus("Your details were saved.")
    } catch (requestError) {
      setLeadStatus(requestError instanceof Error ? requestError.message : "Lead details could not be saved.")
    } finally {
      setBusy(false)
      setLastActivity(Date.now())
    }
  }

  return (
    <main className="kiosk-shell">
      <section className="kiosk-stage" aria-live="polite">
        <div className="kiosk-avatar-panel">
          <div className="kiosk-avatar-visual">
            {config.photoUrl ? (
              <img src={config.photoUrl} alt={config.displayName} />
            ) : (
              <span>{config.initials}</span>
            )}
          </div>
          <div>
            <p className="eyebrow">{config.role}</p>
            <h1>{config.displayName}</h1>
            <p>{config.useCase}</p>
          </div>
          <span className="kiosk-status-pill">{statusLabel}</span>
        </div>

        <div className="kiosk-transcript">
          {messages.length === 0 ? (
            <div className="kiosk-empty-message">
              <p>{config.idleGreeting}</p>
            </div>
          ) : (
            messages.map(message => (
              <article className={`kiosk-message kiosk-message-${message.role}`} key={message.id}>
                <span>{message.role === "visitor" ? "You" : message.role === "avatar" ? config.displayName : "System"}</span>
                <p>{message.content}</p>
              </article>
            ))
          )}
        </div>

        <form className="kiosk-controls" onSubmit={handleSubmit}>
          <button
            className={`kiosk-voice-button${listening ? " is-listening" : ""}`}
            type="button"
            onClick={startVoiceInput}
            disabled={busy || !voiceSupported}
          >
            {listening ? "Listening" : voiceSupported ? "Tap to speak" : "Voice unavailable"}
          </button>
          <label>
            Message
            <input
              value={input}
              onChange={event => setInput(event.target.value)}
              minLength={2}
              maxLength={800}
              placeholder="Type your question"
              disabled={busy}
            />
          </label>
          <button className="kiosk-send-button" type="submit" disabled={busy || input.trim().length < 2}>
            Send
          </button>
        </form>

        <div className="kiosk-secondary-actions">
          <button type="button" onClick={() => void resetSession()}>
            Reset session
          </button>
          {config.qrHandoffUrl ? (
            <a href={config.qrHandoffUrl} target="_blank" rel="noreferrer">
              Continue on phone
            </a>
          ) : null}
          {config.staffCallUrl ? (
            <a href={config.staffCallUrl} target="_blank" rel="noreferrer">
              {config.staffCallLabel ?? "Call staff"}
            </a>
          ) : null}
        </div>

        {leadPrompt ? (
          <form className="kiosk-lead-card" onSubmit={handleLeadSubmit}>
            <h2>{leadPrompt.promptText ?? "Share your details"}</h2>
            <div className="kiosk-lead-grid">
              <input
                value={leadForm.name}
                onChange={event => setLeadForm(current => ({ ...current, name: event.target.value }))}
                placeholder="Name"
                maxLength={120}
                disabled={busy}
              />
              <input
                value={leadForm.email}
                onChange={event => setLeadForm(current => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                type="email"
                maxLength={254}
                disabled={busy}
              />
              <input
                value={leadForm.phone}
                onChange={event => setLeadForm(current => ({ ...current, phone: event.target.value }))}
                placeholder="Phone"
                maxLength={32}
                disabled={busy}
              />
              <input
                value={leadForm.message}
                onChange={event => setLeadForm(current => ({ ...current, message: event.target.value }))}
                placeholder="Message"
                maxLength={1000}
                disabled={busy}
              />
            </div>
            <div className="kiosk-lead-actions">
              <button type="submit" disabled={busy}>
                Save details
              </button>
              <button type="button" onClick={() => setLeadPrompt(null)} disabled={busy}>
                Skip
              </button>
            </div>
          </form>
        ) : null}

        {leadStatus ? <p className="kiosk-lead-status">{leadStatus}</p> : null}
        {error ? <p className="kiosk-error">{error}</p> : null}

        {idle ? (
          <button className="kiosk-idle-overlay" type="button" onClick={markActivity}>
            <span>{config.idleGreeting}</span>
            <strong>Touch to start</strong>
          </button>
        ) : null}
      </section>
    </main>
  )
}
