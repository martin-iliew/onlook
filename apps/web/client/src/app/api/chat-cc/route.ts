/**
 * Claude Code Chat Route
 *
 * Proxies requests from the Vercel AI SDK chat transport to the local Claude
 * Code bridge server (localhost:4567). Requires the bridge to be running —
 * start it with `bun run dev:cc` from the repo root.
 *
 * Enabled by setting NEXT_PUBLIC_USE_CLAUDE_CODE=true in .env.local.
 */

import { getSupabaseUser } from '@/app/api/chat/helpers';
import { api } from '@/trpc/server';
import { toDbMessage } from '@onlook/db';
import type { ChatMessage, ChatMetadata, MessageContext } from '@onlook/models';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

const PORT_FILE = path.join(os.tmpdir(), 'onlook-bridge.port');

function getBridgeUrl(): string {
    if (process.env.CLAUDE_CODE_BRIDGE_URL) return process.env.CLAUDE_CODE_BRIDGE_URL;
    try {
        const port = fs.readFileSync(PORT_FILE, 'utf-8').trim();
        if (port) return `http://localhost:${port}`;
    } catch { /* file not written yet, use default */ }
    return 'http://localhost:4567';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildContextBlock(context: MessageContext[]): string {
    if (!context.length) return '';
    const lines = ['== Context provided by Onlook =='];
    for (const ctx of context) {
        lines.push(`\n[${ctx.displayName}]`);
        if (ctx.content) lines.push(ctx.content);
    }
    return lines.join('\n');
}

function extractLastUserText(messages: ChatMessage[]): string {
    const last = messages.findLast((m) => m.role === 'user');
    if (!last) return '';
    return last.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
}

// ─── Bridge SSE reader ────────────────────────────────────────────────────────

interface BridgeTextEvent { type: 'text_delta'; content: string }
interface BridgeErrorEvent { type: 'error'; message: string }
type BridgeEvent = BridgeTextEvent | BridgeErrorEvent | { type: string }

async function* readBridgeSSE(response: Response): AsyncGenerator<BridgeEvent> {
    const reader = response.body?.getReader();
    if (!reader) return;
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') return;
            try { yield JSON.parse(payload) as BridgeEvent; } catch { /* skip */ }
        }
    }
}

// ─── Bridge session helpers ───────────────────────────────────────────────────

interface SessionCreateResult {
    ok: boolean;
    sandboxConnected?: boolean;
    sandboxError?: string;
}

async function ensureSession(sessionId: string, sandboxId?: string): Promise<SessionCreateResult | null> {
    const BRIDGE_URL = getBridgeUrl();
    try {
        const res = await fetch(`${BRIDGE_URL}/session/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, sandboxId }),
        });
        if (!res.ok) return null;
        return await res.json() as SessionCreateResult;
    } catch {
        return null;
    }
}

async function deleteSession(sessionId: string): Promise<void> {
    const BRIDGE_URL = getBridgeUrl();
    await fetch(`${BRIDGE_URL}/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
}

async function sendBridgeMessage(sessionId: string, message: string): Promise<Response> {
    const BRIDGE_URL = getBridgeUrl();
    const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
    };
    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${BRIDGE_URL}/session/message`, opts);
        if (res.status !== 409) return res;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    // Session is stuck — reset it and try once more
    console.log(`[chat-cc] Session ${sessionId} stuck on 409 — resetting`);
    await deleteSession(sessionId);
    await ensureSession(sessionId);
    return fetch(`${BRIDGE_URL}/session/message`, opts);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        // Auth is best-effort: the bridge is localhost-only and has no Supabase requirement.
        await getSupabaseUser(req).catch(() => null);

        const body = await req.json() as {
            messages: ChatMessage[]
            conversationId: string
            projectId: string
            sandboxId?: string
            context?: MessageContext[]
        };

        const { messages, conversationId, sandboxId, context } = body;
        const userText = extractLastUserText(messages);
        const contextBlock = buildContextBlock(context ?? []);
        const fullMessage = contextBlock ? `${contextBlock}\n\n${userText}` : userText;

        if (!fullMessage.trim()) {
            return new Response(JSON.stringify({ error: 'No message content' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const sessionResult = await ensureSession(conversationId, sandboxId);
        if (!sessionResult) {
            return new Response(
                JSON.stringify({ error: 'Bridge server unavailable. Is it running? (bun run dev:cc)' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const sandboxWarning =
            sandboxId && sessionResult.sandboxConnected === false && sessionResult.sandboxError
                ? `> ⚠️ **Sandbox unavailable:** ${sessionResult.sandboxError}\n> Claude is working on local files instead.\n\n`
                : null;

        const bridgeRes = await sendBridgeMessage(conversationId, fullMessage);
        if (!bridgeRes.ok) {
            const err = await bridgeRes.json().catch(() => ({ error: 'bridge error' })) as { error?: string };
            return new Response(JSON.stringify({ error: err.error ?? 'Bridge error' }), {
                status: bridgeRes.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const baseMetadata: Omit<ChatMetadata, 'finishReason'> = {
            createdAt: new Date(),
            conversationId,
            context: [],
            checkpoints: [],
        };

        const stream = createUIMessageStream<ChatMessage>({
            execute: async ({ writer }) => {
                const textId = uuidv4();

                // Set initial message metadata so the hook has conversationId etc. from the start
                writer.write({ type: 'message-metadata', messageMetadata: baseMetadata as ChatMetadata });
                writer.write({ type: 'text-start', id: textId });

                if (sandboxWarning) {
                    writer.write({ type: 'text-delta', id: textId, delta: sandboxWarning });
                }

                try {
                    for await (const event of readBridgeSSE(bridgeRes)) {
                        if (event.type === 'text_delta') {
                            writer.write({ type: 'text-delta', id: textId, delta: (event as BridgeTextEvent).content });
                        } else if (event.type === 'error') {
                            writer.write({ type: 'text-delta', id: textId, delta: `\n\nError: ${(event as BridgeErrorEvent).message}` });
                            break;
                        }
                    }
                } catch (streamErr) {
                    console.error('[chat-cc] Bridge stream error:', streamErr);
                    writer.write({ type: 'text-delta', id: textId, delta: '\n\n[Connection interrupted]' });
                }

                writer.write({ type: 'text-end', id: textId });

                // Set finishReason so the hook's useEffect fires to create git checkpoints
                // and process the next queued message — same behaviour as the API-token path.
                writer.write({
                    type: 'message-metadata',
                    messageMetadata: { ...baseMetadata, finishReason: 'stop' } satisfies ChatMetadata,
                });

                writer.write({ type: 'finish-step' });
            },
            // Passing originalMessages enables the SDK's persistence mode (assigns a stable
            // message ID to the response) and makes the updated messages available in onFinish.
            originalMessages: messages,
            onFinish: async ({ messages: finalMessages }) => {
                // Persist messages to DB — same as the API-token route's onFinish callback.
                try {
                    const messagesToStore = finalMessages
                        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
                        .map((msg) => toDbMessage(msg, conversationId));

                    await api.chat.message.replaceConversationMessages({
                        conversationId,
                        messages: messagesToStore,
                    });
                } catch (err) {
                    console.error('[chat-cc] Failed to persist messages:', err);
                }
            },
            generateId: () => uuidv4(),
        });

        return createUIMessageStreamResponse({ stream });
    } catch (error) {
        console.error('[chat-cc] Error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error), code: 500 }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}
