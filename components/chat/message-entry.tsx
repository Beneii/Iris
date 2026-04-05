"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChevronDown, FileText, Search, Terminal, Brain, Globe, GitFork, Wrench } from "lucide-react"
import { hapticLight, hapticMedium } from "@/lib/haptics"
import { markdownComponents } from "@/lib/markdown-components"
import { IMAGE_TOOL_RE, findImageInArgs } from "@/lib/image-utils"
import { truncateJsonValues } from "@/lib/utils"
import { IrisLogo } from "@/components/iris-logo"
import type {
  HermesMessage,
  MessageSegment,
  ToolCall,
  ToolStatus,
  ActivityEntry,
} from "@/hooks/use-hermes-bridge"
import { DEFAULT_AGENTS } from "@/components/panels/pantheon-panel"

/* ─── Status dot colors ─── */
export const statusDotColor: Record<ToolStatus, string> = {
  preparing: "var(--color-text-tertiary)",
  running: "var(--color-text-secondary)",
  success: "#34C759",
  error: "#EF4444",
  pending: "#F59E0B",
}


/* ─── Tool icon helper ─── */
const FILE_TOOLS = /read_file|write_file|edit_file|create_file|list_dir|list_files/i
const SEARCH_TOOLS = /search|grep|find|mcp_search|ripgrep/i
const TERMINAL_TOOLS = /bash|terminal|exec|shell|run_command|execute/i
const MEMORY_TOOLS = /memory|remember|recall/i
const MCP_TOOLS = /^mcp_/i
const SUBAGENT_TOOLS = /subagent|agent|dispatch/i

function ToolIcon({ name }: { name: string }) {
  const size = 12
  const style = { color: "var(--color-text-ghost)", flexShrink: 0 as const }

  if (FILE_TOOLS.test(name)) return <FileText size={size} style={style} />
  if (SEARCH_TOOLS.test(name)) return <Search size={size} style={style} />
  if (TERMINAL_TOOLS.test(name)) return <Terminal size={size} style={style} />
  if (MEMORY_TOOLS.test(name)) return <Brain size={size} style={style} />
  if (SUBAGENT_TOOLS.test(name)) return <GitFork size={size} style={style} />
  if (MCP_TOOLS.test(name)) return <Globe size={size} style={style} />
  return <Wrench size={size} style={style} />
}

/* ─── Streaming text — fades each new chunk in smoothly ─── */
function StreamingText({ content }: { content: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const prevLenRef = React.useRef(0)

  React.useLayoutEffect(() => {
    if (!containerRef.current) return
    const cursorEl = containerRef.current.querySelector(".typing-cursor")

    if (content.length > prevLenRef.current) {
      const newText = content.slice(prevLenRef.current)
      const span = document.createElement("span")
      span.textContent = newText
      span.className = "text-chunk-in"
      // Insert before cursor
      if (cursorEl) {
        containerRef.current.insertBefore(span, cursorEl)
      } else {
        containerRef.current.appendChild(span)
      }
    } else if (content.length < prevLenRef.current) {
      // Reset — clear and re-add
      const cursor = containerRef.current.querySelector(".typing-cursor")
      containerRef.current.textContent = ""
      if (content) {
        const span = document.createElement("span")
        span.textContent = content
        containerRef.current.appendChild(span)
      }
      if (cursor) containerRef.current.appendChild(cursor)
      else {
        const c = document.createElement("span")
        c.className = "typing-cursor"
        containerRef.current.appendChild(c)
      }
    }
    prevLenRef.current = content.length
  }, [content])

  return (
    <div
      ref={containerRef}
      style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      <span className="typing-cursor" />
    </div>
  )
}

/* ─── Skeleton Loading ─── */
export function SkeletonLoading() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-text-ghost)",
            animation: `typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/* ─── Reasoning Trace ─── */
const ReasoningTrace = React.memo(function ReasoningTrace({
  messageId,
  reasoning,
  isStreaming,
}: {
  messageId: string
  reasoning: string
  isStreaming: boolean
}) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div style={{ padding: "6px 0 4px 0" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={isStreaming && !expanded ? "thinking-shimmer" : ""}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: isStreaming ? "4px 10px 4px 0" : 0,
          borderRadius: 4,
        }}
      >
        {isStreaming && (
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--color-text-secondary)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--color-text-muted)",
          }}
        >
          {isStreaming ? "Thinking..." : "Thinking"}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: "var(--color-text-faint)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms ease",
          }}
        />
      </button>
      {expanded && (
        <div
          className="reasoning-content"
          style={{
            fontSize: 12,
            color: "var(--color-text-faint)",
            lineHeight: 1.5,
            paddingTop: 4,
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {reasoning}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
})

/* ─── Inline Tool Call (compact: icon + name) ─── */
const InlineToolCall = React.memo(function InlineToolCall({
  toolCall,
  messageCompleted,
}: {
  toolCall: ToolCall
  messageCompleted: boolean
}) {
  const [expanded, setExpanded] = React.useState(false)

  const effectiveStatus: ToolStatus =
    messageCompleted &&
    (toolCall.status === "running" || toolCall.status === "preparing")
      ? "success"
      : toolCall.status

  const isActive =
    effectiveStatus === "running" || effectiveStatus === "preparing"

  const isImageTool = IMAGE_TOOL_RE.test(toolCall.name)
  const imageUrl =
    isImageTool && typeof toolCall.args !== "string"
      ? findImageInArgs(toolCall.args)
      : null

  return (
    <div className="activity-entry" style={{ padding: "1px 0" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "2px 0",
          textAlign: "left" as const,
        }}
      >
        <ToolIcon name={toolCall.name} />
        <span
          style={{
            fontSize: 11,
            fontWeight: isActive ? 500 : 400,
            color: isActive
              ? "var(--color-text-tertiary)"
              : effectiveStatus === "error"
                ? "rgba(239,68,68,0.5)"
                : "var(--color-text-muted)",
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {toolCall.name}
        </span>
        {toolCall.preview && (
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-quaternary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
              maxWidth: 180,
            }}
          >
            {toolCall.preview.slice(0, 50)}
          </span>
        )}
        {isActive && (
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--color-text-secondary)",
              animation: "pulse 1.5s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
        )}
        <ChevronDown
          size={10}
          style={{
            color: "var(--color-border-subtle)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms ease",
            flexShrink: 0,
          }}
        />
      </button>
      {expanded && (
        <div className="reasoning-content" style={{ paddingLeft: 17 }}>
          {toolCall.args && (
            <pre
              style={{
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                fontFamily: "var(--font-geist-mono), monospace",
                margin: "2px 0 4px 0",
                padding: "6px 8px",
                background: "var(--color-hover-bg)",
                borderRadius: 4,
                borderLeft: "2px solid var(--color-text-faint)",
                overflow: "auto",
                whiteSpace: "pre-wrap" as const,
                maxHeight: 150,
              }}
            >
              {typeof toolCall.args === "string"
                ? toolCall.args
                : truncateJsonValues(toolCall.args)}
            </pre>
          )}
          {isImageTool && imageUrl && (
            <div style={{ margin: "6px 0 4px 0" }}>
              <img
                src={imageUrl}
                alt="Screenshot preview"
                onClick={() => window.open(imageUrl, "_blank")}
                style={{
                  maxHeight: 160,
                  borderRadius: 6,
                  border: "1px solid var(--color-border-dim)",
                  cursor: "pointer",
                  display: "block",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
})

/* ─── Approval Inline ─── */
export function ApprovalInline({
  entry,
  agentName,
}: {
  entry: ActivityEntry
  agentName: string
}) {
  const [resolved, setResolved] = React.useState<
    "approved" | "denied" | null
  >(null)

  if (resolved) {
    return (
      <div>
        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          <span
            style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}
          >
            {agentName}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: "var(--color-text-tertiary)",
            }}
          >
            Now
          </span>
        </div>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-text-secondary)",
            margin: 0,
          }}
        >
          {resolved === "approved" ? "Approved." : "Denied."} {entry.summary}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>
          Iris
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "var(--color-text-tertiary)",
          }}
        >
          Now
        </span>
      </div>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-primary)",
          margin: 0,
          marginBottom: 8,
        }}
      >
        {entry.summary}
      </p>
      <div className="flex items-center gap-3">
        <button
          className="approve-action"
          onClick={() => { hapticLight(); setResolved("approved") }}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-status-success)",
            background: "rgba(52,199,89,0.08)",
            border: "1px solid rgba(52,199,89,0.15)",
            borderRadius: 8,
            cursor: "pointer",
            padding: "8px 16px",
            minHeight: 36,
          }}
        >
          Approve
        </button>
        <button
          className="approve-action"
          onClick={() => { hapticMedium(); setResolved("denied") }}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            background: "var(--color-hover-bg)",
            border: "1px solid var(--color-border-dim)",
            borderRadius: 8,
            cursor: "pointer",
            padding: "8px 16px",
            minHeight: 36,
          }}
        >
          Deny
        </button>
      </div>
    </div>
  )
}

/* ─── Message Content (shared between grouped and standalone) ─── */
function MessageContent({
  message,
  isUser,
  isError,
}: {
  message: HermesMessage
  isUser: boolean
  isError: boolean
}) {
  return (
    <>
      {/* Reasoning trace */}
      {message.reasoning && !isUser && (
        <ReasoningTrace
          messageId={message.id}
          reasoning={message.reasoning}
          isStreaming={message.status === "streaming"}
        />
      )}

      {/* Attached images (user-sent) */}
      {message.images && message.images.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: message.content ? 8 : 0 }}>
          {message.images.filter(src => !!src).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt="Attachment"
              onClick={() => window.open(src, "_blank")}
              style={{
                maxWidth: "100%",
                maxHeight: 320,
                borderRadius: 8,
                border: "1px solid var(--color-border-dim)",
                cursor: "pointer",
                display: "block",
                objectFit: "contain",
              }}
            />
          ))}
        </div>
      )}

      {/* Interleaved segments (text + tool calls in order) */}
      {message.segments && message.segments.length > 0 ? (
        <div className="message-content" style={{
          fontSize: 14, fontWeight: 400, lineHeight: 1.6,
          color: isError ? "rgba(239,68,68,0.6)" : "var(--color-text-primary)",
        }}>
          {message.segments.map((seg, i) => {
            if (seg.type === "text") {
              return message.status === "streaming" && i === message.segments!.length - 1 ? (
                <StreamingText key={i} content={seg.content} />
              ) : (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {seg.content}
                </ReactMarkdown>
              )
            }
            return (
              <div key={seg.toolCall.id} className="tool-inline-enter" style={{ margin: "4px 0" }}>
                <InlineToolCall toolCall={seg.toolCall} messageCompleted={message.status === "ready"} />
              </div>
            )
          })}
        </div>
      ) : message.content ? (
        <div
          className="message-content"
          style={{
            fontSize: 14, fontWeight: 400, lineHeight: 1.6,
            color: isError ? "rgba(239,68,68,0.6)" : "var(--color-text-primary)",
          }}
        >
          {message.status === "streaming" ? (
            <StreamingText content={message.content} />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      ) : (
        !isUser && <SkeletonLoading />
      )}

    </>
  )
}

/* ─── Message Entry (standalone, no grouping) ─── */
function MessageEntryInner({
  message,
  agentName,
  showHeader = true,
}: {
  message: HermesMessage
  agentName: string
  showHeader?: boolean
}) {
  const isUser = message.role === "user"
  const isError = message.status === "error"
  const isDivider = message.role === "divider"

  if (isDivider) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "28px 0 12px",
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--color-border-dim)" }} />
        <span style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--color-text-muted)",
          letterSpacing: "0.02em",
          flexShrink: 0,
          whiteSpace: "nowrap" as const,
        }}>
          {message.content}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--color-border-dim)" }} />
      </div>
    )
  }

  const contentBlock = (
    <MessageContent message={message} isUser={isUser} isError={isError} />
  )

  if (isUser) {
    return (
      <div
        className="message-entry"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          paddingRight: 10,
          borderRight: "1px solid rgba(255,255,255,0.2)",
          marginRight: 2,
          alignItems: "flex-end",
        }}
      >
        {showHeader && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: "0.01em" }}>You</span>
          </div>
        )}
        <div style={{ maxWidth: "100%", textAlign: "right" }}>
          {contentBlock}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div
      className="message-entry"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {showHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 2,
          }}
        >
          {(() => {
            const msgAgent = message.agentId ? DEFAULT_AGENTS.find(a => a.id === message.agentId) : null
            const displayName = isError ? "Error" : (msgAgent ? msgAgent.name : agentName)
            const displayColor = isError ? "rgba(239,68,68,0.5)" : (msgAgent ? msgAgent.color : "var(--color-text-secondary)")
            return (
              <span style={{ fontSize: 11, fontWeight: 500, color: displayColor }}>
                {displayName}
              </span>
            )
          })()}
          {message.status === "streaming" && (
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "var(--color-text-secondary)",
                display: "inline-block",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          )}
        </div>
      )}
      {contentBlock}
    </div>
  )
}

const MessageEntry = React.memo(MessageEntryInner)
export default MessageEntry

/* ─── Collapsible Message (for council) ─── */
function CollapsibleMessage({ content, message, isError }: { content: string; message: HermesMessage; isError: boolean }) {
  const [expanded, setExpanded] = React.useState(false)
  // First line = verdict + short reason
  const firstLine = content.split("\n").filter(l => l.trim())[0] || content.slice(0, 100)
  const hasMore = content.trim().length > firstLine.length + 10

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6, color: isError ? "rgba(239,68,68,0.6)" : "var(--color-text-primary)" }}>
          {firstLine}
        </span>
        {hasMore && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: "2px 4px", borderRadius: 3, display: "flex", alignItems: "center",
              color: "var(--color-text-quaternary)",
            }}
          >
            <ChevronDown
              size={12}
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
              }}
            />
          </button>
        )}
      </div>
      {expanded && (
        <div className="reasoning-content" style={{ marginTop: 4 }}>
          <MessageContent message={message} isUser={false} isError={isError} />
        </div>
      )}
    </div>
  )
}

/* ─── Grouping helpers ─── */
interface MessageGroup {
  senderId: string
  messages: HermesMessage[]
}

function parseTimestamp(ts: string): number {
  // Attempt to parse common time formats like "12:34 PM", "Now", ISO, etc.
  if (!ts || ts.toLowerCase() === "now") return Date.now()
  const d = new Date(ts)
  if (!isNaN(d.getTime())) return d.getTime()
  // Try parsing "HH:MM AM/PM" style
  const match = ts.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i)
  if (match) {
    let hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    const period = match[3]?.toLowerCase()
    if (period === "pm" && hours !== 12) hours += 12
    if (period === "am" && hours === 12) hours = 0
    const now = new Date()
    now.setHours(hours, mins, 0, 0)
    return now.getTime()
  }
  return 0
}

function withinTwoMinutes(a: string, b: string): boolean {
  const ta = parseTimestamp(a)
  const tb = parseTimestamp(b)
  if (ta === 0 || tb === 0) return true // Can't parse, assume grouped
  return Math.abs(ta - tb) < 2 * 60 * 1000
}

function groupMessages(messages: HermesMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  for (const msg of messages) {
    if (!msg || !msg.role) continue  // Skip malformed messages
    const senderKey = msg.role === "assistant" ? `assistant:${msg.agentId || "hermes"}` : msg.role
    const last = groups[groups.length - 1]
    if (
      last &&
      last.senderId === senderKey &&
      withinTwoMinutes(
        last.messages[last.messages.length - 1].timestamp,
        msg.timestamp,
      )
    ) {
      last.messages.push(msg)
    } else {
      groups.push({ senderId: senderKey, messages: [msg] })
    }
  }
  return groups
}

/* ─── MessageList (grouped rendering) ─── */
export const MessageList = React.memo(function MessageList({
  messages,
  agentName,
  agentColor,
  onReaction,
  collapsedByDefault = false,
}: {
  messages: HermesMessage[]
  agentName: string
  agentColor?: string
  onReaction?: (messageId: string, reaction: "thumbsup" | "thumbsdown" | null) => void
  collapsedByDefault?: boolean
}) {
  const groups = groupMessages(messages)

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((group, gi) => {
        const isUser = group.senderId === "user"
        const isDividerGroup = group.senderId === "divider"
        const isError = group.messages[0].status === "error"

        // Dividers render inline, no wrapper
        if (isDividerGroup) {
          return group.messages.map((msg) => (
            <MessageEntry key={msg.id} message={msg} agentName="" />
          ))
        }

        return (
          <div
            key={group.messages[0].id}
            style={{
              marginTop: gi === 0 ? 0 : isUser ? 20 : 16,
              display: "flex",
              flexDirection: "column",
              gap: isUser ? 4 : 6,
            }}
          >
            {group.messages.map((msg, mi) => {
              const showHeader = mi === 0
              const msgIsError = msg.status === "error"

              if (isUser) {
                // User messages: right-aligned, accent rail on right, mirrors agent style
                return (
                  <div
                    key={msg.id}
                    className="message-entry"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      paddingRight: 10,
                      borderRight: "1px solid rgba(255,255,255,0.2)",
                      marginRight: 2,
                      alignItems: "flex-end",
                    }}
                  >
                    {showHeader && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 2,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: "0.01em" }}>
                          You
                        </span>
                      </div>
                    )}
                    <div style={{ maxWidth: "100%", textAlign: "right" }}>
                      <MessageContent
                        message={msg}
                        isUser={true}
                        isError={msgIsError}
                      />
                    </div>
                  </div>
                )
              }

              const msgAgent = msg.agentId ? DEFAULT_AGENTS.find(a => a.id === msg.agentId) : null
              const isIris = msg.agentId === "iris"
              const accent = msgIsError
                ? "rgba(239,68,68,0.45)"
                : isIris ? "#FF6B9D"
                : (msgAgent?.color || agentColor || "var(--color-text-secondary)")

              // Iris messages: centered with rainbow divider + eye
              if (isIris) {
                return (
                  <div
                    key={msg.id}
                    className="message-entry"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      margin: "16px 0",
                    }}
                  >
                    {/* Rainbow divider + centered eye */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                      <div className="iris-rainbow-bar" style={{ flex: 1, height: 1 }} />
                      <div className="iris-eye-rainbow" style={{ position: "relative", width: 48, height: 29 }}>
                        {/* Animated eye with rainbow overlay */}
                        <IrisLogo size={48} status="idle" />
                        {/* Rainbow gradient overlay masked to eye shape */}
                        <div style={{
                          position: "absolute", inset: 0,
                          WebkitMaskImage: "url(/iris-static.svg)",
                          WebkitMaskSize: "contain",
                          WebkitMaskRepeat: "no-repeat",
                          WebkitMaskPosition: "center",
                          maskImage: "url(/iris-static.svg)",
                          maskSize: "contain",
                          maskRepeat: "no-repeat",
                          maskPosition: "center",
                          pointerEvents: "none",
                        }}>
                          <div className="iris-rainbow-fill" style={{
                            width: "100%", height: "100%",
                            background: "linear-gradient(90deg, #FF6B9D, #F5C842, #34C759, #5BA4F6, #A855F7, #FF6B9D)",
                            backgroundSize: "200% 100%",
                            opacity: 0.85,
                          }} />
                        </div>
                      </div>
                      <div className="iris-rainbow-bar" style={{ flex: 1, height: 1 }} />
                    </div>
                    {/* Message content centered */}
                    <div style={{ textAlign: "center", maxWidth: "90%" }}>
                      <MessageContent message={msg} isUser={false} isError={false} />
                    </div>
                    {/* Bottom rainbow bar */}
                    <div className="iris-rainbow-bar" style={{ width: "60%", height: 1 }} />
                  </div>
                )
              }

              // Assistant messages: left-aligned, accent rail per author
              return (
                <div
                  key={msg.id}
                  className="message-entry"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    paddingLeft: 10,
                    borderLeft: `1px solid ${accent}33`,
                    marginLeft: 2,
                  }}
                >
                  {showHeader && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: isError ? "rgba(239,68,68,0.5)"
                            : (msgAgent?.color || agentColor || "var(--color-text-secondary)"),
                          letterSpacing: "0.01em",
                        }}
                      >
                        {isError ? "Error" : (msgAgent?.name || agentName)}
                      </span>
                      {msg.status === "streaming" && (
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            background: "var(--color-text-secondary)",
                            display: "inline-block",
                            animation: "pulse 1.5s ease-in-out infinite",
                          }}
                        />
                      )}
                    </div>
                  )}

                  {collapsedByDefault && msg.status === "ready" && !isIris ? (
                    <CollapsibleMessage content={msg.content} message={msg} isError={msgIsError} />
                  ) : (
                    <MessageContent
                      message={msg}
                      isUser={false}
                      isError={msgIsError}
                    />
                  )}
                  {/* Reaction buttons */}
                  {msg.status === "ready" && !msgIsError && onReaction && (
                    <div style={{ display: "flex", gap: 2, marginTop: 4, opacity: msg.reaction ? 1 : 0, transition: "opacity 150ms" }}
                      className="reaction-bar"
                    >
                      <button
                        onClick={() => onReaction(msg.id, msg.reaction === "thumbsup" ? null : "thumbsup")}
                        style={{
                          background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px",
                          fontSize: 12, borderRadius: 4, opacity: msg.reaction === "thumbsup" ? 1 : 0.4,
                        }}
                      >
                        👍
                      </button>
                      <button
                        onClick={() => onReaction(msg.id, msg.reaction === "thumbsdown" ? null : "thumbsdown")}
                        style={{
                          background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px",
                          fontSize: 12, borderRadius: 4, opacity: msg.reaction === "thumbsdown" ? 1 : 0.4,
                        }}
                      >
                        👎
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
})
