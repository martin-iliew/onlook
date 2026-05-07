/**
 * bridge-events.ts
 *
 * Shared types and parser for claude --output-format stream-json events.
 * Browser-safe: no Node.js imports.
 */

// ─── Typed events sent over SSE from bridge server → browser ─────────────────

export type BridgeEvent =
  | { type: "text_delta"; content: string }
  | { type: "thinking_delta"; content: string }
  | { type: "tool_use_start"; toolName: string }
  | { type: "tool_use_end" }
  | { type: "turn_end"; stopReason: string }
  | { type: "error"; message: string }

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse one line of claude's --output-format stream-json output into
 * zero or more typed BridgeEvents.
 *
 * With --verbose, claude emits streaming delta events:
 *  - content_block_start  — signals a new content block (text or tool_use)
 *  - content_block_delta  — streaming text or thinking chunks
 *  - content_block_stop   — end of a content block
 *  - assistant            — full response (fallback if deltas weren't emitted)
 *  - result               — turn complete
 */
export function parseStreamEvent(raw: unknown): BridgeEvent[] {
  if (typeof raw !== "object" || raw === null) return []
  const ev = raw as Record<string, unknown>

  // ── Streaming text / thinking deltas (primary streaming path) ────────────
  if (ev.type === "content_block_delta") {
    const delta = ev.delta as Record<string, unknown> | undefined
    if (!delta) return []
    if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text.length > 0) {
      return [{ type: "text_delta", content: delta.text }]
    }
    if (delta.type === "thinking_delta" && typeof delta.thinking === "string" && delta.thinking.length > 0) {
      return [{ type: "thinking_delta", content: delta.thinking }]
    }
    return []
  }

  // ── Tool use starting ─────────────────────────────────────────────────────
  if (ev.type === "content_block_start") {
    const block = ev.content_block as Record<string, unknown> | undefined
    if (block?.type === "tool_use" && typeof block.name === "string") {
      return [{ type: "tool_use_start", toolName: block.name }]
    }
    return []
  }

  // ── Tool use ending ───────────────────────────────────────────────────────
  if (ev.type === "content_block_stop") {
    return [{ type: "tool_use_end" }]
  }

  // ── Full assistant message (fallback — fires when deltas were suppressed) ──
  if (ev.type === "assistant" && typeof ev.message === "object" && ev.message !== null) {
    const msg = ev.message as Record<string, unknown>
    if (!Array.isArray(msg.content)) return []
    const events: BridgeEvent[] = []
    for (const block of msg.content) {
      if (typeof block !== "object" || block === null) continue
      const b = block as Record<string, unknown>
      if (b.type === "text" && typeof b.text === "string" && b.text.length > 0) {
        events.push({ type: "text_delta", content: b.text })
      } else if (b.type === "tool_use" && typeof b.name === "string") {
        events.push({ type: "tool_use_start", toolName: b.name })
      }
    }
    return events
  }

  // ── Turn end ──────────────────────────────────────────────────────────────
  if (ev.type === "result") {
    const stopReason = typeof ev.subtype === "string" ? ev.subtype : "end_turn"
    return [{ type: "turn_end", stopReason }]
  }

  return []
}
