"use client"

import { updateAvatarVoiceAction } from "@/app/actions/avatars"
import { AvatarRecord } from "@/lib/avatar"
import { AvatarVoiceRecord, isVoiceLanguageCompatible } from "@/lib/avatar-voice-shared"
import { useActionState, useMemo, useState } from "react"

type AvatarVoiceFormState = {
  status: "idle" | "error" | "success"
  message?: string
  fieldErrors?: {
    avatarId?: string
    voiceId?: string
  }
}

const initialState: AvatarVoiceFormState = { status: "idle" }

function providerLabel(provider: string): string {
  if (provider === "MOCK") {
    return "Studio sample"
  }

  return provider
}

function uniqueLanguages(voices: AvatarVoiceRecord[]): string[] {
  return Array.from(new Set(voices.map(voice => voice.language))).sort((a, b) => a.localeCompare(b))
}

function VoiceDetails({ voice }: { voice: AvatarVoiceRecord }) {
  return (
    <div className="voice-detail-grid">
      <span>{voice.language}</span>
      <span>{voice.style}</span>
      <span>{voice.presentationStyle}</span>
      <span>{providerLabel(voice.provider)}</span>
    </div>
  )
}

export default function AvatarVoiceForm({
  avatar,
  voices,
  canEditVoice
}: {
  avatar: Pick<AvatarRecord, "id" | "language" | "voice">
  voices: AvatarVoiceRecord[]
  canEditVoice: boolean
}) {
  const [languageFilter, setLanguageFilter] = useState("all")
  const [selectedVoiceId, setSelectedVoiceId] = useState(avatar.voice?.id ?? "")
  const [state, action, pending] = useActionState(updateAvatarVoiceAction, initialState)
  const languageOptions = useMemo(() => uniqueLanguages(voices), [voices])
  const visibleVoices = voices.filter(voice => languageFilter === "all" || voice.language === languageFilter)

  return (
    <section className="avatar-step-panel">
      <div>
        <h3>Voice</h3>
        <p className="avatar-step-description">
          Select the speaking profile this avatar will use in future audio and video responses.
          Generated speech is not available until the TTS/audio phase.
        </p>
      </div>
      <div className="voice-current-panel">
        <p className="eyebrow">Current selected voice</p>
        {avatar.voice ? (
          <div>
            <h4>{avatar.voice.name}</h4>
            <VoiceDetails voice={avatar.voice} />
            {avatar.voice.status !== "ACTIVE" ? (
              <p className="form-error">This selected voice is inactive. Choose an active voice before future runtime use.</p>
            ) : null}
          </div>
        ) : (
          <p className="avatar-step-description">No voice selected yet.</p>
        )}
      </div>
      <form className="form-shell" action={action}>
        <input type="hidden" name="avatarId" value={avatar.id} />
        <label>
          Language filter
          <select value={languageFilter} onChange={event => setLanguageFilter(event.target.value)}>
            <option value="all">All active voices</option>
            {languageOptions.map(language => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <div className="voice-option-grid" role="radiogroup" aria-label="Voice library">
          {visibleVoices.map(voice => {
            const compatible = isVoiceLanguageCompatible(avatar.language, voice.language)
            const checked = selectedVoiceId === voice.id
            const inputId = `voice-${voice.id}`
            return (
              <div
                className={checked ? "voice-option-card selected" : "voice-option-card"}
                key={voice.id}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="voiceId"
                  value={voice.id}
                  checked={checked}
                  disabled={!canEditVoice || !compatible}
                  onChange={() => setSelectedVoiceId(voice.id)}
                />
                <label className="voice-option-main" htmlFor={inputId}>
                  <strong>{voice.name}</strong>
                  <VoiceDetails voice={voice} />
                  {!compatible ? (
                    <span className="voice-compatibility-note">
                      Not compatible with avatar language: {avatar.language}
                    </span>
                  ) : null}
                </label>
                {voice.previewUrl ? (
                  <a className="avatarkit-link-button" href={voice.previewUrl} target="_blank" rel="noreferrer">
                    Preview sample
                  </a>
                ) : (
                  <button className="avatarkit-button avatarkit-button-secondary" type="button" disabled>
                    No preview sample
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {visibleVoices.length === 0 ? (
          <p className="form-helper">No active voices match this filter.</p>
        ) : null}
        {state.fieldErrors?.voiceId ? <p className="form-error">{state.fieldErrors.voiceId}</p> : null}
        {state.status === "error" && state.message ? <p className="form-error">{state.message}</p> : null}
        {state.status === "success" ? <p className="form-success">{state.message}</p> : null}
        {canEditVoice ? (
          <div className="voice-action-row">
            <button
              className="avatarkit-button avatarkit-button-primary"
              type="submit"
              disabled={pending || !selectedVoiceId}
            >
              {pending ? "Saving voice..." : "Save selected voice"}
            </button>
            <button
              className="avatarkit-button avatarkit-button-secondary"
              type="submit"
              name="clearVoice"
              value="true"
              disabled={pending || !avatar.voice}
              onClick={() => setSelectedVoiceId("")}
            >
              Clear voice
            </button>
          </div>
        ) : (
          <p className="form-helper">Viewer role can see voice state but cannot change the selected voice.</p>
        )}
      </form>
    </section>
  )
}
