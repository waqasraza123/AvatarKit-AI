import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode
} from "react"

export type AvatarKitOutputMode = "text" | "audio" | "video"

export type AvatarKitAuthTokenProvider = () => string | Promise<string>

export type AvatarKitClientConfig = {
  apiKey?: string
  apiBaseUrl?: string
  authTokenProvider?: AvatarKitAuthTokenProvider
  credentials?: RequestCredentials
}

export type AvatarKitProviderProps = AvatarKitClientConfig & {
  children: ReactNode
  onError?: (error: AvatarKitError) => void
}

export type AvatarKitAvatarConfig = {
  id: string
  displayName: string
  role: string
  useCase: string
  language: string
  status: string
  supportedOutputModes: AvatarKitOutputMode[]
  defaultOutputMode: AvatarKitOutputMode
  publishedAt: string | null
}

export type AvatarKitConversation = {
  conversationId: string
  avatarId: string
  visitorId: string | null
  status: string
  createdAt: string
}

export type AvatarKitMessage = {
  id: string
  role: "visitor" | "avatar"
  content: string
  audioUrl?: string | null
  videoUrl?: string | null
  runtimeStatus?: string
}

export type AvatarKitLeadInput = {
  name?: string
  email?: string
  phone?: string
  message?: string
}

export type AvatarKitLeadResult = {
  leadId: string
  status: string
  duplicateBehavior: "created" | "updated"
}

export class AvatarKitError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type AvatarKitContextValue = {
  client: AvatarKitClient
  onError?: (error: AvatarKitError) => void
}

type SendMessageInput = {
  conversationId: string
  message: string
  outputMode?: AvatarKitOutputMode
}

type StartConversationInput = {
  avatarId: string
  visitorId?: string
  summary?: string
}

const AvatarKitContext = createContext<AvatarKitContextValue | null>(null)

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  const nestedError = payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
    ? payload.error as Record<string, unknown>
    : null
  if (!response.ok) {
    throw new AvatarKitError(
      response.status,
      typeof nestedError?.code === "string" ? nestedError.code : typeof payload.code === "string" ? payload.code : "request_failed",
      typeof nestedError?.message === "string" ? nestedError.message : typeof payload.message === "string" ? payload.message : "AvatarKit request failed."
    )
  }

  return payload as T
}

export class AvatarKitClient {
  private readonly apiKey?: string
  private readonly apiBaseUrl: string
  private readonly authTokenProvider?: AvatarKitAuthTokenProvider
  private readonly credentials?: RequestCredentials

  constructor(config: AvatarKitClientConfig) {
    this.apiKey = config.apiKey
    this.apiBaseUrl = (config.apiBaseUrl ?? "https://api.avatarkit.ai").replace(/\/$/, "")
    this.authTokenProvider = config.authTokenProvider
    this.credentials = config.credentials
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set("accept", "application/json")
    const authToken = this.authTokenProvider ? await this.authTokenProvider() : this.apiKey

    if (authToken) {
      headers.set("authorization", `Bearer ${authToken}`)
    }

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json")
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: init.credentials ?? this.credentials
    })

    return parseResponse<T>(response)
  }

  async getAvatarConfig(avatarId: string): Promise<AvatarKitAvatarConfig> {
    const payload = await this.request<{ avatar: AvatarKitAvatarConfig }>(`/api/public/v1/avatars/${encodeURIComponent(avatarId)}/config`)
    return payload.avatar
  }

  async startConversation(input: StartConversationInput): Promise<AvatarKitConversation> {
    const payload = await this.request<{ conversation: AvatarKitConversation }>("/api/public/v1/conversations", {
      method: "POST",
      body: JSON.stringify(input)
    })
    return payload.conversation
  }

  async sendMessage(input: SendMessageInput): Promise<AvatarKitMessage> {
    const payload = await this.request<{
      avatarMessage: {
        id: string
        content: string
        audioUrl: string | null
        videoUrl: string | null
        runtimeStatus: string
      }
    }>(`/api/public/v1/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        message: input.message,
        outputMode: input.outputMode ?? "text"
      })
    })

    return {
      id: payload.avatarMessage.id,
      role: "avatar",
      content: payload.avatarMessage.content,
      audioUrl: payload.avatarMessage.audioUrl,
      videoUrl: payload.avatarMessage.videoUrl,
      runtimeStatus: payload.avatarMessage.runtimeStatus
    }
  }

  async submitLead(conversationId: string, input: AvatarKitLeadInput): Promise<AvatarKitLeadResult> {
    return this.request<AvatarKitLeadResult>(`/api/public/v1/conversations/${encodeURIComponent(conversationId)}/lead`, {
      method: "POST",
      body: JSON.stringify(input)
    })
  }
}

export function AvatarKitProvider({
  apiKey,
  apiBaseUrl,
  authTokenProvider,
  credentials,
  children,
  onError
}: AvatarKitProviderProps) {
  const client = useMemo(() => new AvatarKitClient({
    apiKey,
    apiBaseUrl,
    authTokenProvider,
    credentials
  }), [apiKey, apiBaseUrl, authTokenProvider, credentials])

  return createElement(AvatarKitContext.Provider, {
    value: { client, onError }
  }, children)
}

export function useAvatarKit() {
  const context = useContext(AvatarKitContext)
  if (!context) {
    throw new AvatarKitError(500, "missing_provider", "useAvatarKit must be used inside AvatarKitProvider.")
  }

  return context
}

export function useAvatarSession(avatarId: string, options: { visitorId?: string; outputMode?: AvatarKitOutputMode } = {}) {
  const { client, onError } = useAvatarKit()
  const [conversation, setConversation] = useState<AvatarKitConversation | null>(null)
  const [messages, setMessages] = useState<AvatarKitMessage[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AvatarKitError | null>(null)

  const handleError = useCallback((caught: unknown) => {
    const nextError = caught instanceof AvatarKitError
      ? caught
      : new AvatarKitError(500, "sdk_error", caught instanceof Error ? caught.message : "AvatarKit SDK request failed.")
    setError(nextError)
    onError?.(nextError)
    return nextError
  }, [onError])

  const start = useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      const nextConversation = await client.startConversation({
        avatarId,
        visitorId: options.visitorId
      })
      setConversation(nextConversation)
      return nextConversation
    } catch (caught) {
      throw handleError(caught)
    } finally {
      setPending(false)
    }
  }, [avatarId, client, handleError, options.visitorId])

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) {
      throw handleError(new AvatarKitError(400, "empty_message", "Message cannot be empty."))
    }

    setPending(true)
    setError(null)
    try {
      const activeConversation = conversation ?? await client.startConversation({
        avatarId,
        visitorId: options.visitorId
      })
      setConversation(activeConversation)
      const visitorMessage: AvatarKitMessage = {
        id: `local-${Date.now()}`,
        role: "visitor",
        content: trimmed
      }
      setMessages(current => [...current, visitorMessage])
      const avatarMessage = await client.sendMessage({
        conversationId: activeConversation.conversationId,
        message: trimmed,
        outputMode: options.outputMode ?? "text"
      })
      setMessages(current => [...current, avatarMessage])
      return avatarMessage
    } catch (caught) {
      throw handleError(caught)
    } finally {
      setPending(false)
    }
  }, [avatarId, client, conversation, handleError, options.outputMode, options.visitorId])

  const submitLead = useCallback(async (input: AvatarKitLeadInput) => {
    if (!conversation) {
      throw handleError(new AvatarKitError(400, "missing_conversation", "Start a conversation before submitting a lead."))
    }

    return client.submitLead(conversation.conversationId, input).catch(error => {
      throw handleError(error)
    })
  }, [client, conversation, handleError])

  return {
    conversation,
    messages,
    pending,
    error,
    start,
    sendMessage,
    submitLead
  }
}

export function TalkingAvatar({
  avatarId,
  outputMode = "text",
  visitorId,
  className,
  style,
  placeholder = "Ask a question",
  onMessage,
  onError
}: {
  avatarId: string
  outputMode?: AvatarKitOutputMode
  visitorId?: string
  className?: string
  style?: CSSProperties
  placeholder?: string
  onMessage?: (message: AvatarKitMessage) => void
  onError?: (error: AvatarKitError) => void
}) {
  const session = useAvatarSession(avatarId, { outputMode, visitorId })
  const [input, setInput] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = input.trim()
    if (!value || session.pending) {
      return
    }

    setInput("")
    try {
      const message = await session.sendMessage(value)
      onMessage?.(message)
    } catch (caught) {
      if (caught instanceof AvatarKitError) {
        onError?.(caught)
      }
    }
  }

  return createElement("section", {
    className,
    style
  }, [
    createElement("div", { key: "messages", "aria-live": "polite" }, session.messages.map(message => createElement("article", {
      key: message.id,
      "data-role": message.role
    }, [
      createElement("p", { key: "content" }, message.content),
      message.audioUrl ? createElement("audio", { key: "audio", controls: true, src: message.audioUrl }) : null,
      message.videoUrl ? createElement("video", { key: "video", controls: true, playsInline: true, src: message.videoUrl }) : null
    ]))),
    session.error ? createElement("p", { key: "error", role: "alert" }, session.error.message) : null,
    createElement("form", { key: "form", onSubmit: handleSubmit }, [
      createElement("input", {
        key: "input",
        value: input,
        placeholder,
        disabled: session.pending,
        onChange: (event: ChangeEvent<HTMLInputElement>) => setInput(event.target.value)
      }),
      createElement("button", {
        key: "button",
        type: "submit",
        disabled: session.pending || input.trim().length === 0
      }, session.pending ? "Sending..." : "Send")
    ])
  ])
}
