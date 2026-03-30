"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChevronDown, FileText, Search, Terminal, Brain, Globe, GitFork, Wrench } from "lucide-react"
import { hapticLight, hapticMedium } from "@/lib/haptics"

import { truncateJsonValues } from "@/lib/utils"
import type {
  HermesMessage,
  MessageSegment,
  ToolCall,
  ToolStatus,
  ActivityEntry,
} from "@/hooks/use-hermes-bridge"

/* ─── Status dot colors ─── */
export const statusDotColor: Record<ToolStatus, string> = {
  preparing: "rgba(255,255,255,0.4)",
  running: "rgba(255,255,255,0.7)",
  success: "#34C759",
  error: "#EF4444",
  pending: "#F59E0B",
}


/* ─── Image extensions for detection ─── */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i
const IMAGE_TOOL_RE = /screenshot|vision|image|browser_snapshot/i

function looksLikeImagePath(val: unknown): string | null {
  if (typeof val !== "string") return null
  if (IMAGE_EXT_RE.test(val) || /screenshot/i.test(val)) return val
  return null
}

function findImageInArgs(
  args: Record<string, unknown> | string | undefined,
): string | null {
  if (!args) return null
  if (typeof args === "string") return looksLikeImagePath(args)
  for (const v of Object.values(args)) {
    const found = looksLikeImagePath(v)
    if (found) return found
  }
  return null
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
  const style = { color: "rgba(255,255,255,0.25)", flexShrink: 0 as const }

  if (FILE_TOOLS.test(name)) return <FileText size={size} style={style} />
  if (SEARCH_TOOLS.test(name)) return <Search size={size} style={style} />
  if (TERMINAL_TOOLS.test(name)) return <Terminal size={size} style={style} />
  if (MEMORY_TOOLS.test(name)) return <Brain size={size} style={style} />
  if (SUBAGENT_TOOLS.test(name)) return <GitFork size={size} style={style} />
  if (MCP_TOOLS.test(name)) return <Globe size={size} style={style} />
  return <Wrench size={size} style={style} />
}

/* ─── Code Block with Copy Button ─── */
function CodeBlock({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const isBlock = className?.includes("language-")
  const language = className?.replace("language-", "") || ""

  if (isBlock) {
    return (
      <code
        style={{
          display: "block",
          position: "relative" as const,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 13,
          background: "rgba(255,255,255,0.02)",
          borderRadius: 4,
          padding: "8px 12px",
          overflowX: "auto",
          lineHeight: 1.5,
        }}
      >
        {language && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: copied ? 52 : 8,
              fontSize: 10,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            {language}
          </span>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(String(children))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 4,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            minHeight: 32,
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        {children}
      </code>
    )
  }

  return (
    <code
      style={{
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 13,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 3,
        padding: "1px 5px",
      }}
    >
      {children}
    </code>
  )
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

/* ─── Shared Markdown Components ─── */
export const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: "4px 0" }}>{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1
      style={{
        fontSize: 20,
        fontWeight: 700,
        marginTop: 16,
        marginBottom: 8,
        color: "inherit",
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2
      style={{
        fontSize: 17,
        fontWeight: 600,
        marginTop: 16,
        marginBottom: 8,
        color: "inherit",
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3
      style={{
        fontSize: 15,
        fontWeight: 600,
        marginTop: 16,
        marginBottom: 8,
        color: "inherit",
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4
      style={{
        fontSize: 14,
        fontWeight: 600,
        marginTop: 16,
        marginBottom: 8,
        color: "inherit",
      }}
    >
      {children}
    </h4>
  ),
  code: CodeBlock,
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre style={{ margin: "8px 0", overflowX: "auto", maxWidth: "100%" }}>{children}</pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul
      style={{ listStyleType: "disc", paddingLeft: 20, margin: "8px 0" }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol
      style={{ listStyleType: "decimal", paddingLeft: 20, margin: "8px 0" }}
    >
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ margin: "4px 0", display: "list-item", lineHeight: 1.6 }}>
      {children}
    </li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ fontWeight: 600 }}>{children}</strong>
  ),
  a: ({
    children,
    href,
  }: {
    children?: React.ReactNode
    href?: string
  }) => (
    <a
      href={href}
      style={{ color: "rgba(255,255,255,0.7)", textDecoration: "none" }}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  // eslint-disable-next-line @next/next/no-img-element
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => props.src ? (
    <img
      src={props.src}
      alt={props.alt || ""}
      onClick={() => window.open(props.src as string, "_blank")}
      style={{
        maxWidth: "100%",
        borderRadius: 8,
        margin: "8px 0",
        border: "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer",
        display: "block",
      }}
    />
  ) : null,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      style={{
        margin: "8px 0",
        paddingLeft: 12,
        borderLeft: "2px solid rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.5)",
      }}
    >
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: "auto", margin: "10px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
      <table
        style={{
          borderCollapse: "collapse" as const,
          fontSize: 13,
          width: "100%",
          minWidth: 300,
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead style={{ background: "rgba(255,255,255,0.03)" }}>{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th
      style={{
        textAlign: "left" as const,
        padding: "8px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        fontWeight: 600,
        fontSize: 12,
        color: "rgba(255,255,255,0.5)",
        whiteSpace: "nowrap" as const,
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td
      style={{
        padding: "6px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </td>
  ),
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
            background: "rgba(255,255,255,0.25)",
            animation: `typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/* ─── Reasoning Trace ─── */
function ReasoningTrace({
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
              background: "rgba(255,255,255,0.7)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(255,255,255,0.2)",
          }}
        >
          {isStreaming ? "Thinking..." : "Thinking"}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: "rgba(255,255,255,0.15)",
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
            color: "rgba(255,255,255,0.15)",
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
}

/* ─── Inline Tool Call (compact: icon + name) ─── */
function InlineToolCall({
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
              ? "rgba(255,255,255,0.45)"
              : effectiveStatus === "error"
                ? "rgba(239,68,68,0.5)"
                : "rgba(255,255,255,0.22)",
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          {toolCall.name}
        </span>
        {toolCall.preview && (
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.12)",
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
              background: "rgba(255,255,255,0.7)",
              animation: "pulse 1.5s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
        )}
        <ChevronDown
          size={10}
          style={{
            color: "rgba(255,255,255,0.08)",
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
                color: "rgba(255,255,255,0.3)",
                fontFamily: "var(--font-geist-mono), monospace",
                margin: "2px 0 4px 0",
                padding: "6px 8px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 4,
                borderLeft: "2px solid rgba(255,255,255,0.15)",
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
                  border: "1px solid rgba(255,255,255,0.06)",
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
}

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
            style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}
          >
            {agentName}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: "rgba(255,255,255,0.3)",
            }}
          >
            Now
          </span>
        </div>
        <p
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.6)",
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
        <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
          Iris
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          Now
        </span>
      </div>
      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.85)",
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
            color: "#34C759",
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
            color: "rgba(255,255,255,0.4)",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
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
                border: "1px solid rgba(255,255,255,0.06)",
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
          color: isError ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.9)",
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
            color: isError ? "rgba(239,68,68,0.6)" : isUser ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.9)",
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

  const contentBlock = (
    <MessageContent message={message} isUser={isUser} isError={isError} />
  )

  if (isUser) {
    return (
      <div
        className="message-entry"
        style={{
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            maxWidth: "85%",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 16,
            borderBottomRightRadius: 4,
            padding: "6px 12px",
          }}
        >
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
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: isError
                ? "rgba(239,68,68,0.5)"
                : "rgba(255,255,255,0.5)",
            }}
          >
            {isError ? "Error" : agentName}
          </span>
          {message.status === "streaming" && (
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.7)",
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
    const last = groups[groups.length - 1]
    if (
      last &&
      last.senderId === msg.role &&
      withinTwoMinutes(
        last.messages[last.messages.length - 1].timestamp,
        msg.timestamp,
      )
    ) {
      last.messages.push(msg)
    } else {
      groups.push({ senderId: msg.role, messages: [msg] })
    }
  }
  return groups
}

/* ─── MessageList (grouped rendering) ─── */
export const MessageList = React.memo(function MessageList({
  messages,
  agentName,
}: {
  messages: HermesMessage[]
  agentName: string
}) {
  const groups = groupMessages(messages)

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((group, gi) => {
        const isUser = group.senderId === "user"
        const isError = group.messages[0].status === "error"

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
                // User messages: right-aligned bubbles, no label
                return (
                  <div
                    key={msg.id}
                    className="message-entry"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "85%",
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 16,
                        borderBottomRightRadius: mi === group.messages.length - 1 ? 4 : 16,
                        padding: "10px 14px",
                      }}
                    >
                      <MessageContent
                        message={msg}
                        isUser={true}
                        isError={msgIsError}
                      />
                    </div>
                  </div>
                )
              }

              // Assistant messages: left-aligned, no background
              return (
                <div
                  key={msg.id}
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
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: isError
                            ? "rgba(239,68,68,0.5)"
                            : "rgba(255,255,255,0.5)",
                        }}
                      >
                        {isError ? "Error" : agentName}
                      </span>
                      {msg.status === "streaming" && (
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.7)",
                            display: "inline-block",
                            animation: "pulse 1.5s ease-in-out infinite",
                          }}
                        />
                      )}
                    </div>
                  )}

                  <MessageContent
                    message={msg}
                    isUser={false}
                    isError={msgIsError}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
})
