"use client"

import * as React from "react"
import { ArrowUp, Square, Paperclip, ImagePlus, X } from "lucide-react"

interface Attachment {
  name: string
  type: string
  url: string
}

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isProcessing: boolean
  showCommandPalette: boolean
  onCommandPaletteChange: (show: boolean) => void
  onFilesAttached?: (files: File[]) => void
  attachments?: Attachment[]
  onRemoveAttachment?: (index: number) => void
  onCancel?: () => void
}

export default function Composer({
  value,
  onChange,
  onSend,
  isProcessing,
  showCommandPalette,
  onCommandPaletteChange,
  onFilesAttached,
  attachments,
  onRemoveAttachment,
  onCancel,
}: ComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = React.useState(false)

  /* Auto-resize: use a hidden measurement div instead of scrollHeight */
  const measureRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const measure = measureRef.current
    if (!measure) return
    measure.textContent = value + "\n" // trailing newline ensures last line counts
    const h = Math.max(22, Math.min(measure.scrollHeight, 120))
    if (textareaRef.current) {
      textareaRef.current.style.height = `${h}px`
    }
  }, [value])

  // Retain focus after send on desktop (not mobile — we want keyboard to dismiss)
  const prevValueRef = React.useRef(value)
  React.useEffect(() => {
    if (prevValueRef.current && !value) {
      const isNative = !!(window as any).Capacitor?.isNativePlatform?.()
      if (!isNative) {
        queueMicrotask(() => textareaRef.current?.focus())
      }
    }
    prevValueRef.current = value
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    onChange(next)
    if (next === "/") onCommandPaletteChange(true)
    else if (!next.startsWith("/")) onCommandPaletteChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandPalette && (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Tab")) return
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isProcessing) {
        textareaRef.current?.blur()
        onSend()
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files)
    if (files.length > 0 && onFilesAttached) {
      e.preventDefault()
      onFilesAttached(files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0 && onFilesAttached) onFilesAttached(files)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0 && onFilesAttached) onFilesAttached(files)
    e.target.value = ""
  }

  const canSend = value.trim().length > 0 && !isProcessing

  return (
    <div
      className={`composer-wrapper ${isDragOver ? "composer-dragover" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "rgba(26, 26, 31, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 10,
        padding: "8px 8px",
      }}
    >
      {/* Attachment preview strip */}
      {attachments && attachments.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "0 4px 8px 4px", overflowX: "auto" }}>
          {attachments.map((att, i) => (
            <div key={`${att.name}-${i}`} className="attachment-item" style={{ position: "relative", flexShrink: 0 }}>
              {att.type.startsWith("image/") ? (
                <img src={att.url} alt={att.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }} />
              ) : (
                <div style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{att.name}</div>
              )}
              {onRemoveAttachment && (
                <button aria-label={`Remove ${att.name}`} onClick={() => onRemoveAttachment(i)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  <X size={8} style={{ color: "rgba(255,255,255,0.6)" }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Attach buttons */}
        <button type="button" aria-label="Attach file" onClick={() => fileInputRef.current?.click()} className="hover-brighten" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.15)", flexShrink: 0 }}>
          <Paperclip size={16} />
        </button>
        <button type="button" aria-label="Attach image" onClick={() => imageInputRef.current?.click()} className="hover-brighten" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.15)", flexShrink: 0 }}>
          <ImagePlus size={16} />
        </button>

        <input ref={fileInputRef} type="file" multiple onChange={handleFileInputChange} style={{ display: "none" }} />
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleFileInputChange} style={{ display: "none" }} />

        {/* Textarea + hidden measure div */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {/* Hidden measurement div — same font/sizing as textarea */}
          <div ref={measureRef} aria-hidden style={{
            position: "absolute", top: 0, left: 0, right: 0,
            visibility: "hidden", whiteSpace: "pre-wrap", wordWrap: "break-word",
            fontSize: 16, fontFamily: "inherit", lineHeight: "22px",
            padding: 0, margin: 0, border: "none",
            pointerEvents: "none", overflow: "hidden",
          }} />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isProcessing ? "Waiting for response..." : "Message..."}
            className="composer-input"
            rows={1}
            style={{
              display: "block",
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "rgba(255,255,255,0.85)",
              fontSize: 16,
              fontFamily: "inherit",
              lineHeight: "22px",
              resize: "none",
              height: 22,
              overflow: "hidden",
              opacity: isProcessing ? 0.5 : 1,
              padding: 0,
              margin: 0,
            }}
          />
        </div>

        {/* Send / Cancel */}
        {isProcessing ? (
          <button aria-label="Stop response" onClick={onCancel} className="send-btn" style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Square size={10} fill="rgba(239,68,68,0.8)" style={{ color: "rgba(239,68,68,0.8)" }} />
          </button>
        ) : (
          <button aria-label="Send message" onClick={() => { textareaRef.current?.blur(); onSend() }} disabled={!canSend} className="send-btn" style={{ width: 32, height: 32, borderRadius: "50%", background: canSend ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.04)", border: "none", cursor: canSend ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ArrowUp size={14} style={{ color: canSend ? "#111113" : "rgba(255,255,255,0.1)" }} />
          </button>
        )}
      </div>
    </div>
  )
}
