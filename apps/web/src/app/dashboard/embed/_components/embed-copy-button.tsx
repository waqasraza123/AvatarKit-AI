"use client"

import { useState } from "react"

export function EmbedCopyButton({ script }: { script: string }) {
  const [copied, setCopied] = useState(false)

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button className="avatarkit-button avatarkit-button-primary" type="button" onClick={copyScript}>
      {copied ? "Copied" : "Copy script"}
    </button>
  )
}
