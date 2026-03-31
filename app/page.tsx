"use client"

import * as React from "react"

import { useHermesBridge, HOME_SESSION_ID, type HermesMessage } from "@/hooks/use-hermes-bridge"
import { IrisLogo } from "@/components/iris-logo"
import MessageEntry, { ApprovalInline, MessageList } from "@/components/chat/message-entry"
import Composer from "@/components/chat/composer"
import { CommandPalette, type Command } from "@/components/command-palette"
import SessionSidebar from "@/components/sidebar/session-list"
import SettingsModal from "@/components/panels/settings-panel"
import PantheonPanel from "@/components/panels/pantheon-panel"
import { hapticLight, hapticMedium, hapticSuccess, hapticError } from "@/lib/haptics"
import { useKeyboardLayout } from "@/hooks/use-keyboard-layout"

/* ─── Responsive hook ─── */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [query])
  return matches
}


/* ─── Main Page ─── */
export default function HomePage() {
  const {
    messages,
    activities,
    connectionState,
    model,
    provider,
    agentName,
    memoryData,
    configData,
    contextPressure,
    isProcessing,
    sendMessage,
    newSession,
    requestMemory,
    requestConfig,
    requestToolsets,
    requestSkills,
    toolsetsData,
    skillsData,
    permissionsData,
    requestPermissions,
    setPermission,
    setConfig,
    sessionsList,
    activeSessionId,
    resumeSession,
    deleteSession,
    jobsList,
    jobOutputs,
    listJobs,
    createJob,
    pauseJob,
    resumeJob: resumeJobAction,
    triggerJob,
    removeJob,
    getJobOutput,
    sendMessageWithAttachments,
    cancelResponse,
    reconnect,
    unreadSessions,
  } = useHermesBridge()

  const [composerValue, setComposerValue] = React.useState("")
  const [sidebarVisible, setSidebarVisible] = React.useState(true)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [pantheonVisible, setPantheonVisible] = React.useState(true)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [settingsTab, setSettingsTab] = React.useState<string>("settings")
  const [showCommandPalette, setShowCommandPalette] = React.useState(false)
  const [attachments, setAttachments] = React.useState<{ name: string; type: string; url: string }[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const isMobile = useMediaQuery("(max-width: 767px)")
  const isCompact = useMediaQuery("(max-width: 1023px)")
  useKeyboardLayout()

  // Auto-scroll only if user is near the bottom (within 150px)
  const isNearBottomRef = React.useRef(true)
  const [showScrollDown, setShowScrollDown] = React.useState(false)

  const handleScroll = React.useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const nearBottom = scrollHeight - scrollTop - clientHeight < 80
    isNearBottomRef.current = nearBottom
    setShowScrollDown(!nearBottom && scrollHeight > clientHeight + 300)
  }, [])

  const scrollToBottom = React.useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
      setShowScrollDown(false)
    }
  }, [])

  React.useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current!.scrollHeight, behavior: "smooth" })
      })
    }
  }, [messages])

  // Haptic feedback when agent finishes responding
  const prevLastMessageStatusRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== "assistant") return
    const prev = prevLastMessageStatusRef.current
    prevLastMessageStatusRef.current = last.status
    if (prev === "streaming" && last.status === "ready") hapticSuccess()
    if (last.status === "error" && prev !== "error") hapticError()
  }, [messages])

  const handleSend = async () => {
    if (!composerValue.trim() && attachments.length === 0) return
    hapticLight()
    const text = composerValue.trim()

    if (attachments.length > 0) {
      // Convert blob URLs to base64
      const encoded = await Promise.all(
        attachments.map(async (att) => {
          try {
            const resp = await fetch(att.url)
            const blob = await resp.blob()
            const reader = new FileReader()
            const base64 = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })
            return { name: att.name, type: att.type, data: base64 }
          } catch {
            return { name: att.name, type: att.type, data: "" }
          }
        })
      )
      // Convert data URLs to the format the bridge expects: {data: "raw_base64", mime: "image/png"}
      const imageAttachments = encoded.filter(a => a.data && a.type.startsWith("image/"))
      const images = imageAttachments.map(a => {
        const raw = a.data.includes(",") ? a.data.split(",")[1] : a.data
        return { data: raw, mime: a.type }
      })
      // Keep the full data URLs for display in chat (stable, no blob expiry issues)
      const displayImages = imageAttachments.map(a => a.data)

      sendMessageWithAttachments(text || "What do you see in this image?", images, displayImages)
    } else {
      sendMessage(text)
    }

    setComposerValue("")
    // Revoke blob URLs to prevent memory leaks
    attachments.forEach((att) => URL.revokeObjectURL(att.url))
    setAttachments([])
    // Scroll to bottom on send — delay to let React render the new message
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current!.scrollHeight, behavior: "smooth" })
    }, 50)
    setSettingsOpen(false)
    setShowCommandPalette(false)
  }

  const handleFilesAttached = (files: File[]) => {
    const newAttachments = files.map((f) => ({
      name: f.name,
      type: f.type,
      url: URL.createObjectURL(f),
    }))
    setAttachments((prev) => [...prev, ...newAttachments])
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleCommandSelect = (command: Command) => {
    setShowCommandPalette(false)

    // UI actions
    if (command.action === "ui") {
      switch (command.name) {
        case "/new":
          hapticLight()
          newSession()
          setComposerValue("")
          return
        case "/memory":
          setSettingsTab("memory")
          setSettingsOpen(true)
          setComposerValue("")
          return
        case "/skills":
          setSettingsTab("skills")
          setSettingsOpen(true)
          setComposerValue("")
          return
        case "/schedule":
          setSettingsTab("tasks")
          setSettingsOpen(true)
          setComposerValue("")
          return
        case "/agents":
        case "/mcp":
          setSettingsTab("tools")
          setSettingsOpen(true)
          setComposerValue("")
          return
      }
    }

    // Send commands: insert the command text and send
    if (command.action === "send") {
      // Commands that take arguments: insert and let user type
      if (command.name === "/browse" || command.name === "/search" || command.name === "/terminal" || command.name === "/vision") {
        setComposerValue(command.name + " ")
        return
      }
      // Commands that send directly
      sendMessage(command.name)
      setComposerValue("")
    }
  }

  // Extract command palette query from composer value
  const paletteQuery = showCommandPalette && composerValue.startsWith("/")
    ? composerValue.slice(1)
    : ""

  // Derive session title from first user message
  const isHome = activeSessionId === HOME_SESSION_ID

  const sessionTitle = React.useMemo(() => {
    if (activeSessionId === HOME_SESSION_ID) return "Home"
    const firstUser = messages.find((m) => m.role === "user")
    if (!firstUser) return "New conversation"
    const text = firstUser.content
    return text.length > 35 ? text.slice(0, 35) + "..." : text
  }, [messages, activeSessionId])

  return (
    <div className="flex h-dvh" style={{
      background: "var(--color-surface)",
      overflow: "hidden",
    }}>
      {/* ─── Left Sidebar ─── */}
      {/* Collapsed: narrow column with eye logo + traffic light space */}
      {!isMobile && !sidebarVisible && (
        <div className="flex flex-col items-center flex-shrink-0" style={{
          width: 100,
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border-dim)",
          paddingTop: 52,
        }}>
          <div>
            <IrisLogo size={80} status={connectionState !== "connected" ? "error" : isProcessing ? "processing" : "idle"} />
          </div>
        </div>
      )}
      <div style={{
        width: isMobile ? 0 : sidebarVisible ? 240 : 0,
        overflow: "hidden",
        flexShrink: 0,
      }}>
      <SessionSidebar
        sessionsList={sessionsList}
        activeSessionId={activeSessionId}
        resumeSession={resumeSession}
        deleteSession={deleteSession}
        newSession={newSession}
        connectionState={connectionState}
        model={model}
        onSettingsOpen={() => setSettingsOpen(true)}
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        onSidebarClose={() => setSidebarOpen(false)}
        unreadSessions={unreadSessions}
        isProcessing={isProcessing}
      />
      </div>

      {/* ─── Main Area ─── */}
      <main className="flex flex-col flex-1 min-w-0" style={{ background: "var(--color-canvas)" }}>
        {/* Header */}
        <header
          className="flex flex-col flex-shrink-0"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            borderBottom: "1px solid var(--color-border-dim)",
            // @ts-expect-error WebkitAppRegion is non-standard
            WebkitAppRegion: "drag",
          }}
        >
          {/* Progress bar — sits below the safe area, above header content */}
          <div style={{
            height: 2,
            width: "100%",
            overflow: "hidden",
            opacity: isProcessing ? 1 : 0,
            transition: "opacity 300ms ease",
          }}>
            <div style={{
              height: "100%",
              background: "linear-gradient(90deg, rgba(255,255,255,0.4), rgba(255,255,255,0.15), rgba(255,255,255,0.4))",
              backgroundSize: "200% 100%",
              animation: isProcessing ? "iris-progress 1.5s linear infinite" : "none",
            }} />
          </div>
          {/* Header content row */}
          <div className="flex items-center px-6" style={{ height: 52, gap: 12 }}>
          {/* Left: panel toggle + agent name */}
          <div className="flex items-center gap-3 flex-shrink-0" style={{
            // @ts-expect-error WebkitAppRegion is non-standard
            WebkitAppRegion: "no-drag",
          }}>
            {isMobile ? (
              <button
                aria-label="Open sidebar"
                onClick={() => { hapticLight(); setSidebarOpen(true) }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 12,
                  margin: -12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 44,
                  minHeight: 44,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 5h12M3 9h12M3 13h12" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <button
                aria-label="Toggle sidebar"
                onClick={() => {
                  setSidebarVisible((v) => {
                    const next = !v;
                    (window as any).electronAPI?.resizeWindow(next ? 140 : -140)
                    return next
                  })
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: sidebarVisible ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)",
                  transition: "color 150ms ease",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="5.5" y1="2" x2="5.5" y2="14" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            )}
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
              {agentName}
            </span>
          </div>

          {/* Center: session title — takes all remaining space, truncates */}
          <div style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontWeight: 400,
            color: "var(--color-text-tertiary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap" as const,
            pointerEvents: "none",
          }}>
            {sessionTitle}
          </div>

          {/* Right: context pressure + activity toggle */}
          <div className="flex items-center gap-3 flex-shrink-0" style={{
            // @ts-expect-error WebkitAppRegion is non-standard
            WebkitAppRegion: "no-drag",
          }}>
            {contextPressure > 0 && (
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "var(--color-text-quaternary)" }}>{contextPressure}%</span>
                <div style={{ width: 64, height: 3, borderRadius: 2, background: "var(--color-border-dim)", overflow: "hidden" }}>
                  <div className="pressure-bar-fill" style={{ width: `${contextPressure}%`, height: "100%", borderRadius: 2, background: contextPressure > 80 ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.3)" }} />
                </div>
              </div>
            )}
          </div>
          </div>{/* end header content row */}
        </header>

        {/* Offline banner */}
        {connectionState === "disconnected" && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "8px 16px",
            background: "rgba(239,68,68,0.08)",
            borderBottom: "1px solid rgba(239,68,68,0.15)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, color: "rgba(239,68,68,0.7)" }}>Connection lost</span>
            <button
              onClick={() => { hapticLight(); reconnect() }}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255,255,255,0.7)",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                padding: "4px 12px",
                cursor: "pointer",
                minHeight: 28,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ─── Chat ─── */}
        <>
          {/* Messages */}
            <div ref={scrollRef} onScroll={handleScroll}
              onTouchStart={(e) => { (scrollRef.current as any).__touchStartY = e.touches[0].clientY }}
              onTouchEnd={(e) => {
                const startY = (scrollRef.current as any).__touchStartY ?? 0
                const dy = Math.abs(e.changedTouches[0].clientY - startY)
                if (dy < 10 && document.activeElement instanceof HTMLElement && document.activeElement.tagName === "TEXTAREA") {
                  document.activeElement.blur()
                }
              }}
              className="flex-1 overflow-y-auto px-6 py-4" style={{ overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: 16 }}>
              <div className="mx-auto" style={{ maxWidth: 640 }}>
                {messages.length === 0 ? (
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "60vh",
                    gap: 20,
                  }}>
                    <div style={{ opacity: 0.15 }}>
                      <IrisLogo size={48} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 400, color: "var(--color-text-tertiary)", textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
                        Inspect code, debug issues, run commands, or ask anything.
                      </span>
                      <span style={{ fontSize: 12, color: "var(--color-text-quaternary)" }}>
                        Type <span style={{ color: "var(--color-iris-purple)", fontFamily: "var(--font-geist-mono), monospace" }}>/</span> to see available commands
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <MessageList messages={messages} agentName={agentName} />

                    {/* Inline approval actions from activity */}
                    {activities
                      .filter((a) => a.kind === "approval" && a.status === "pending")
                      .map((a) => (
                        <div key={a.id} style={{ marginTop: 24 }}>
                          <ApprovalInline entry={a} agentName={agentName} />
                        </div>
                      ))}
                  </>
                )}
              </div>
            </div>

            {/* Scroll to bottom arrow */}
            {showScrollDown && (
              <div style={{ position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
                <button
                  onClick={scrollToBottom}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.1)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Composer area */}
            <div className="flex-shrink-0 px-4" style={{ paddingTop: 6, paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
              {/* Command Palette */}
              <div className="mx-auto" style={{ maxWidth: 640, position: "relative" }}>
                <CommandPalette
                  query={paletteQuery}
                  visible={showCommandPalette}
                  onSelect={handleCommandSelect}
                  onClose={() => {
                    setShowCommandPalette(false)
                    setComposerValue("")
                  }}
                />
                <Composer
                  value={composerValue}
                  onChange={(val) => {
                    setComposerValue(val)
                    // Show palette when typing / at start
                    if (val.startsWith("/") && !showCommandPalette) {
                      setShowCommandPalette(true)
                    }
                    // Hide if user deletes the /
                    if (!val.startsWith("/") && showCommandPalette) {
                      setShowCommandPalette(false)
                    }
                  }}
                  onSend={handleSend}
                  isProcessing={isProcessing}
                  showCommandPalette={showCommandPalette}
                  onCommandPaletteChange={setShowCommandPalette}
                  attachments={attachments}
                  onFilesAttached={handleFilesAttached}
                  onRemoveAttachment={handleRemoveAttachment}
                  onCancel={() => { hapticMedium(); cancelResponse() }}
                />
              </div>
            </div>
        </>
      </main>

      {/* ─── Right Panel: Pantheon ─── */}
      {!isMobile && pantheonVisible && (
        <div style={{
          width: 220,
          flexShrink: 0,
          height: "100%",
          overflow: "hidden",
        }}>
          <PantheonPanel isProcessing={isProcessing} />
        </div>
      )}

      {/* ─── Settings Modal ─── */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        configData={configData}
        requestConfig={requestConfig}
        setConfig={setConfig}
        model={model}
        provider={provider}
        agentName={agentName}
        memoryData={memoryData}
        requestMemory={requestMemory}
        toolsetsData={toolsetsData}
        requestToolsets={requestToolsets}
        skillsData={skillsData}
        requestSkills={requestSkills}
        permissionsData={permissionsData}
        requestPermissions={requestPermissions}
        setPermission={setPermission}
        jobsList={jobsList}
        jobOutputs={jobOutputs}
        listJobs={listJobs}
        createJob={createJob}
        pauseJob={pauseJob}
        resumeJob={resumeJobAction}
        triggerJob={triggerJob}
        removeJob={removeJob}
        getJobOutput={getJobOutput}
      />
    </div>
  )
}
