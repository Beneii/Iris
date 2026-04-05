"use client"

import * as React from "react"

import { useHermesBridge, HOME_SESSION_ID, type HermesMessage } from "@/hooks/use-hermes-bridge"
import { IrisLogo } from "@/components/iris-logo"
import MessageEntry, { ApprovalInline, MessageList } from "@/components/chat/message-entry"
import Composer from "@/components/chat/composer"
import { CommandPalette, type Command } from "@/components/command-palette"
import { MentionPicker } from "@/components/chat/mention-picker"
import { MentionClickProvider } from "@/lib/markdown-components"
import SessionSidebar from "@/components/sidebar/session-list"
import SettingsModal from "@/components/panels/settings-panel"
import { ChatHeader } from "@/components/chat/chat-header"
import { OfflineBanner } from "@/components/chat/offline-banner"
import PantheonPanel, { AgentPopout, DEFAULT_AGENTS, type PantheonAgent } from "@/components/panels/pantheon-panel"
import { EmptyState } from "@/components/chat/empty-state"
import { MobileDrawer } from "@/components/panels/mobile-drawer"
import { hapticLight, hapticMedium } from "@/lib/haptics"
import { useKeyboardLayout } from "@/hooks/use-keyboard-layout"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useAutoScroll } from "@/hooks/use-auto-scroll"
import { useSwipeGesture } from "@/hooks/use-swipe-gesture"
import { useHapticFeedback } from "@/hooks/use-haptic-feedback"


/* ─── Static lookups (outside render) ─── */
const _AGENT_IDS = new Set(DEFAULT_AGENTS.map(a => a.id))
const _HERMES_AGENT = DEFAULT_AGENTS.find(a => a.id === "hermes")!

/* ─── Main Page ─── */
export default function HomePage() {
  const {
    messages,
    activities,
    connectionState,
    model,
    provider,
    agentName,
    agentsData,
    providersData,
    queueStatus,
    sessionRoster,
    channelsList,
    restartAgent,
    evolutionStatus,
    sendAction,
    projectsList,
    requestProjects,
    createProject,
    updateProject: updateProjectAction,
    deleteProject: deleteProjectAction,
    linkSession: linkSessionAction,
    unlinkSession: unlinkSessionAction,
    requestAgents,
    requestProviders,
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
    activeTarget,
    navigateTo,
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
  const [showMentionPicker, setShowMentionPicker] = React.useState(false)
  const [attachments, setAttachments] = React.useState<{ name: string; type: string; url: string }[]>([])
  const [popoutAgent, setPopoutAgent] = React.useState<PantheonAgent | null>(null)

  const isMobile = useMediaQuery("(max-width: 767px)")
  const isCompact = useMediaQuery("(max-width: 1023px)")
  useKeyboardLayout()

  const { scrollRef, handleScroll, scrollToBottom, showScrollDown, resetScroll } = useAutoScroll(messages, isProcessing)
  const { agentPanelOpen, setAgentPanelOpen, handleSwipeStart, handleSwipeEnd } = useSwipeGesture(isMobile, sidebarOpen, setSidebarOpen)
  useHapticFeedback(messages)

  // ─── Keyboard Shortcuts ───
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === "k") { e.preventDefault(); setShowCommandPalette(true); setComposerValue("/") }
      if (meta && e.key === "n") { e.preventDefault(); hapticLight(); newSession() }
      if (meta && e.key === ",") { e.preventDefault(); setSettingsOpen(true) }
      if (meta && e.key === "b") { e.preventDefault(); setSidebarVisible(v => !v) }
      if (meta && e.key === ".") { e.preventDefault(); setPantheonVisible(v => !v) }
      // Cmd+1-5 to switch agents
      if (meta && e.key >= "1" && e.key <= "5") {
        e.preventDefault()
        const agents = ["hermes", "talos", "icarus", "charon", "nyx"]
        const idx = parseInt(e.key) - 1
        if (agents[idx]) navigateTo({ kind: "dm", agentId: agents[idx] })
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [newSession, navigateTo])

  // ─── Target Logic ───
  const isDM = activeSessionId === HOME_SESSION_ID || _AGENT_IDS.has(activeSessionId)
  const currentAgent = isDM
    ? (activeSessionId === HOME_SESSION_ID ? _HERMES_AGENT : DEFAULT_AGENTS.find(a => a.id === activeSessionId) || null)
    : null
  const isArchiveChannel = activeSessionId === "archive"

  const targetName = currentAgent ? currentAgent.name : isArchiveChannel ? "archive" : activeSessionId || "general"
  const channelColor = currentAgent ? currentAgent.color : "var(--color-text-tertiary)"

  // Compute agent roster: for DMs show that agent, for channels use channel's agent_ids
  const effectiveRoster = React.useMemo(() => {
    if (isDM && currentAgent) return [currentAgent.id]
    // Find channel agent_ids from channelsList
    const ch = channelsList.find(c => c.id === activeSessionId)
    if (ch?.agent_ids && ch.agent_ids.length > 0) return ch.agent_ids
    // No explicit agent_ids = open channel, show all agents
    return []
  }, [isDM, currentAgent, channelsList, activeSessionId])

  const handleSend = async () => {
    if (!composerValue.trim() && attachments.length === 0) return
    hapticLight()
    const text = composerValue.trim()

    if (attachments.length > 0) {
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
      const imageAttachments = encoded.filter(a => a.data && a.type.startsWith("image/"))
      const images = imageAttachments.map(a => {
        const raw = a.data.includes(",") ? a.data.split(",")[1] : a.data
        return { data: raw, mime: a.type }
      })
      const displayImages = imageAttachments.map(a => a.data)

      sendMessageWithAttachments(text || "What do you see in this image?", images, displayImages)
    } else if (text.startsWith("/evolve")) {
      const parts = text.replace("/evolve", "").trim().split(" ")
      const type = parts[0] || "skill"  // skill, soul, tool, prompt
      const target = parts.slice(1).join(" ") || "general"
      if (type === "soul") {
        sendAction("evolve_soul", { profile: target, iterations: 5 })
      } else if (type === "tool") {
        sendAction("evolve_tool", { tool: target, iterations: 5 })
      } else if (type === "prompt") {
        sendAction("evolve_prompt", { file: target, iterations: 5 })
      } else {
        sendAction("evolve_skill", { skill: type === "skill" ? target : type, iterations: 5 })
      }
    } else if (text.startsWith("/council")) {
      // Parse: /council [turns] [subject]
      const parts = text.replace("/council", "").trim()
      const turnMatch = parts.match(/^(\d+)\s+(.+)/)
      const turns = turnMatch ? parseInt(turnMatch[1]) : 2
      const subject = turnMatch ? turnMatch[2] : parts || "Open discussion"
      sendAction("start_council", { turns, subject })
      // The bridge will send session.resumed for the new channel — auto-navigate
    } else {
      sendMessage(text)
    }

    setComposerValue("")
    attachments.forEach((att) => { try { URL.revokeObjectURL(att.url) } catch { /* ignore */ } })
    setAttachments([])
    resetScroll()
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
      if (removed?.url) try { URL.revokeObjectURL(removed.url) } catch { /* ignore */ }
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
      // Commands that need args — set text and let user add args + Enter
      if (["/browse", "/search", "/terminal", "/vision", "/council", "/evolve", "/plan", "/review", "/debug"].includes(command.name)) {
        setComposerValue(command.name + " ")
        setShowCommandPalette(false)
        return
      }
      sendMessage(command.name)
      setComposerValue("")
    }
  }

  // Extract command palette query from composer value
  const paletteQuery = showCommandPalette && composerValue.startsWith("/")
    ? composerValue.slice(1)
    : ""

  // Extract @mention query from composer value
  const mentionQuery = React.useMemo(() => {
    if (!showMentionPicker) return ""
    const match = composerValue.match(/(^|[\s])@(\w*)$/)
    return match ? match[2] : ""
  }, [showMentionPicker, composerValue])

  const handleMentionSelect = React.useCallback((agent: { id: string; name: string }) => {
    // Replace the @partial with @agentname
    const match = composerValue.match(/(^|.*[\s])@(\w*)$/)
    if (match) {
      const prefix = match[1]
      setComposerValue(prefix + "@" + agent.name.toLowerCase() + " ")
    }
    setShowMentionPicker(false)
  }, [composerValue])

  // Open agent popout when clicking @mention in messages
  const handleMentionClick = React.useCallback((agentId: string) => {
    const agent = DEFAULT_AGENTS.find(a => a.id === agentId)
    if (agent) setPopoutAgent(agent)
  }, [])

  // Derive channel/session title
  const sessionTitle = React.useMemo(() => {
    if (isDM && currentAgent) return currentAgent.role
    const firstUser = messages.find((m) => m.role === "user")
    if (!firstUser) return ""
    const text = firstUser.content
    return text.length > 35 ? text.slice(0, 35) + "..." : text
  }, [messages, isDM, currentAgent])

  // Toggle agents panel — purely CSS, no window resize IPC
  const togglePantheon = React.useCallback(() => {
    setPantheonVisible(v => !v)
  }, [])

  return (
    <div className="flex h-dvh" style={{
      background: "var(--color-surface)",
      overflow: "hidden",
    }}>
      {/* ─── Left Sidebar ─── */}
      {/* Collapsed: narrow column with eye logo + traffic light space */}
      {!isMobile && !sidebarVisible && (
        <div className="flex flex-col items-center flex-shrink-0 panel-surface" style={{
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
        overflow: isMobile ? "visible" : "hidden",
        flexShrink: 0,
      }}>
      <div style={{
        width: 240,
        ...(!isMobile ? {
          transform: sidebarVisible ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        } : {}),
        height: "100%",
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
        channels={channelsList}
        onArchiveChannel={(cid) => sendAction("archive_channel", { channel_id: cid })}
      />
      </div>
      </div>

      {/* ─── Main Area ─── */}
      <main
        className="flex flex-col flex-1 min-w-0"
        style={{ background: "var(--color-canvas)" }}
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}
      >
        <ChatHeader
          channelName={targetName}
          isDM={isDM}
          currentAgent={currentAgent}
          channelColor={channelColor}
          sessionTitle={sessionTitle}
          contextPressure={contextPressure}
          isMobile={isMobile}
          sidebarVisible={sidebarVisible}
          pantheonVisible={pantheonVisible}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
          onTogglePantheon={togglePantheon}
          onOpenMobileSidebar={() => setSidebarOpen(true)}
        />

        {connectionState === "disconnected" && <OfflineBanner onReconnect={reconnect} />}

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
              <MentionClickProvider value={handleMentionClick}>
              <div className="mx-auto" style={{ maxWidth: 640 }}>
                {messages.length === 0 ? (
                  <EmptyState currentAgent={currentAgent ?? undefined} isArchiveChannel={isArchiveChannel} />
                ) : (
                  <>
                    <MessageList messages={messages} agentName={currentAgent ? currentAgent.name : agentName} agentColor={channelColor} collapsedByDefault={activeSessionId.startsWith("council-")} />

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
              </MentionClickProvider>
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
                    background: "var(--color-border-subtle)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    border: "1px solid var(--color-border-subtle)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <MentionPicker
                  query={mentionQuery}
                  visible={showMentionPicker && !showCommandPalette}
                  onSelect={handleMentionSelect}
                  onClose={() => setShowMentionPicker(false)}
                />
                <Composer
                  value={composerValue}
                  onChange={(val) => {
                    setComposerValue(val)
                    if (val === "/") {
                      setShowCommandPalette(true)
                    } else if (val.startsWith("/") && val.includes(" ")) {
                      // User is typing args after command — dismiss palette
                      setShowCommandPalette(false)
                    } else if (val.startsWith("/") && !val.includes(" ") && !showCommandPalette) {
                      setShowCommandPalette(true)
                    } else if (!val.startsWith("/")) {
                      setShowCommandPalette(false)
                    }
                  }}
                  onSend={handleSend}
                  isProcessing={isProcessing}
                  isChannel={!isDM}
                  showCommandPalette={showCommandPalette}
                  onCommandPaletteChange={setShowCommandPalette}
                  showMentionPicker={showMentionPicker}
                  onMentionPickerChange={setShowMentionPicker}
                  attachments={attachments}
                  onFilesAttached={handleFilesAttached}
                  onRemoveAttachment={handleRemoveAttachment}
                  onCancel={() => { hapticMedium(); cancelResponse() }}
                />
              </div>
            </div>
        </>
      </main>

      {/* ─── Right Panel: Agents ─── */}
      {/* Desktop: inline panel with smooth transition */}
      {!isMobile && (
        <div style={{
          width: pantheonVisible ? 220 : 0,
          flexShrink: 0,
          height: "100%",
          overflow: "hidden",
        }}>
          <div style={{
            width: 220,
            height: "100%",
            transform: pantheonVisible ? "translateX(0)" : "translateX(100%)",
            transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
          }}>
            <PantheonPanel isProcessing={isProcessing} activeSessionId={activeSessionId} liveAgents={agentsData} queueStatus={queueStatus} sessionRoster={effectiveRoster} onAgentClick={(agent) => setPopoutAgent(agent)} onOpenDM={(agentId) => { navigateTo({ kind: "dm", agentId }); setPopoutAgent(null) }} />
          </div>
        </div>
      )}
      {/* Mobile: slide-in from right */}
      {isMobile && (
        <MobileDrawer isOpen={agentPanelOpen} onClose={() => setAgentPanelOpen(false)}>
          <PantheonPanel isProcessing={isProcessing} activeSessionId={activeSessionId} liveAgents={agentsData} queueStatus={queueStatus} sessionRoster={effectiveRoster} onAgentClick={(agent) => setPopoutAgent(agent)} onOpenDM={(agentId) => { navigateTo({ kind: "dm", agentId }); setPopoutAgent(null) }} />
        </MobileDrawer>
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
        providersData={providersData}
        requestProviders={requestProviders}
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
        projectsList={projectsList}
        activeSessionId={activeSessionId}
        onCreateProject={createProject}
        onUpdateProject={updateProjectAction}
        onDeleteProject={deleteProjectAction}
        onLinkSession={linkSessionAction}
        onUnlinkSession={unlinkSessionAction}
        requestProjects={requestProjects}
      />

      {/* ─── Agent Popout (triggered from sidebar or agents panel) ─── */}
      {popoutAgent && (
        <AgentPopout
          agent={popoutAgent}
          onClose={() => setPopoutAgent(null)}
          onOpenDM={(agentId) => {
            navigateTo({ kind: "dm", agentId })
            setPopoutAgent(null)
          }}
          onRestart={restartAgent}
        />
      )}
    </div>
  )
}
