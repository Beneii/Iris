"use client"

import * as React from "react"

/* ─── Agent @mention highlighting ─── */
export const AGENT_COLORS: Record<string, string> = {
  hermes: "#5BA4F6",
  talos: "#E8853D",
  icarus: "#F5C842",
  charon: "#34C759",
  nyx: "#A855F7",
  iris: "#FF6B9D",  // Rainbow-pink — Iris herself
}

/* Context for mention click handler — set by the chat view */
type MentionClickHandler = (agentId: string) => void
const MentionClickContext = React.createContext<MentionClickHandler | null>(null)
export const MentionClickProvider = MentionClickContext.Provider

const MENTION_RE = /(@(?:hermes|talos|icarus|charon|nyx))\b/gi

function MentionSpan({ name, color, keyId }: { name: string; color: string; keyId: string }) {
  const onClick = React.useContext(MentionClickContext)
  return (
    <span
      key={keyId}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(name) } : undefined}
      style={{
        color,
        backgroundColor: `${color}20`,
        borderRadius: 4,
        padding: "1px 5px",
        fontWeight: 600,
        fontSize: "0.95em",
        cursor: onClick ? "pointer" : undefined,
        transition: "background 120ms ease",
      }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.backgroundColor = `${color}35` } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.backgroundColor = `${color}20` } : undefined}
    >
      @{name}
    </span>
  )
}

function processString(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(MENTION_RE)
  if (parts.length === 1) return [text]
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const name = part.slice(1).toLowerCase()
      const color = AGENT_COLORS[name]
      if (color) {
        return <MentionSpan key={`${keyPrefix}-${i}`} name={name} color={color} keyId={`${keyPrefix}-${i}`} />
      }
    }
    return part
  })
}

function highlightMentions(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child, ci) => {
    if (typeof child === "string") {
      const result = processString(child, `m${ci}`)
      return result.length === 1 ? result[0] : result
    }
    if (React.isValidElement(child)) {
      const props = child.props as Record<string, unknown>
      if (props.children) {
        return React.cloneElement(child, {}, highlightMentions(props.children as React.ReactNode))
      }
    }
    return child
  })
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
          background: "var(--color-hover-bg)",
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
              color: "var(--color-text-muted)",
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
            background: "var(--color-border-dim)",
            border: "none",
            borderRadius: 4,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 11,
            color: "var(--color-text-tertiary)",
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
        background: "var(--color-border-dim)",
        borderRadius: 3,
        padding: "1px 5px",
      }}
    >
      {children}
    </code>
  )
}

/* ─── Shared Markdown Components ─── */
export const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: "4px 0" }}>{highlightMentions(children)}</p>
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
      {highlightMentions(children)}
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
      style={{ color: "var(--color-text-secondary)", textDecoration: "none" }}
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
        border: "1px solid var(--color-border-dim)",
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
        borderLeft: "2px solid var(--color-border-subtle)",
        color: "var(--color-text-secondary)",
      }}
    >
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: "auto", margin: "10px 0", borderRadius: 6, border: "1px solid var(--color-border-dim)" }}>
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
    <thead style={{ background: "var(--color-hover-bg)" }}>{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th
      style={{
        textAlign: "left" as const,
        padding: "8px 12px",
        borderBottom: "1px solid var(--color-border-subtle)",
        fontWeight: 600,
        fontSize: 12,
        color: "var(--color-text-secondary)",
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
        borderBottom: "1px solid var(--color-hover-bg)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </td>
  ),
}
