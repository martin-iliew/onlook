/**
 * Claude Code Bridge Server
 *
 * Runs on localhost:4567. Wraps the `claude` CLI so the Onlook chat panel can
 * hold multi-turn conversations using your Claude Code subscription — no API
 * keys needed.
 *
 * Usage (from repo root):
 *   bun run dev:cc
 *
 * Env vars (loaded from apps/web/client/.env.local via --env-file flag):
 *   BRIDGE_PORT               — port to listen on (default: 4567)
 *   CSB_API_KEY               — CodeSandbox API key for sandbox sync
 *   CLAUDE_CODE_PROJECT_ROOT  — fallback cwd when no sandboxId is given
 *                                (default: repo root)
 *
 * Endpoints:
 *   POST   /session/create      → spawn claude process, returns { sessionId }
 *   POST   /session/message     → send message, stream SSE events
 *   POST   /session/resume      → reconnect to a saved session (--resume)
 *   DELETE /session/:id         → kill process and clean up
 *   GET    /session/:id/status  → { alive, claudeSessionId, lastActivity }
 *   GET    /health              → { status: "ok" }
 */

import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import type { ChildProcess } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
// The @codesandbox/sdk/browser bundle uses native WebSocket (bun-compatible).
// The /node and default bundles use the `ws` npm package which conflicts with
// bun's WebSocket implementation ("Unexpected server response: 101").
// Polyfill the browser globals the SDK checks for so it runs cleanly in bun.
if (typeof window === 'undefined') {
    ;(globalThis as any).window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        Blob: globalThis.Blob,
    }
    ;(globalThis as any).document = {
        hasFocus: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
    }
}

import { CodeSandbox } from '@codesandbox/sdk'
import { connectToSandbox } from '@codesandbox/sdk/browser'
import type { WebSocketSession } from '@codesandbox/sdk'
import {
    addOidsToAst,
    formatContent,
    getAstFromContent,
    getContentFromAst,
    injectPreloadScript,
} from '@onlook/parser'
import { RouterType } from '@onlook/models'
import { isRootLayoutFile } from '@onlook/utility'
import { ONLOOK_INSTRUCTIONS, SHELL_PROMPT, SYSTEM_PROMPT } from '@onlook/ai'
import { parseStreamEvent } from './events.js'
import { getTextSyncPlan } from './sync-plan.js'

const PREFERRED_PORT = Number(process.env.BRIDGE_PORT ?? 4567)
const PORT_FILE = path.join(os.tmpdir(), 'onlook-bridge.port')
let actualPort = PREFERRED_PORT

function findFreePort(start: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const tryPort = (p: number) => {
            if (p > start + 20) { reject(new Error('No free port found in range')); return }
            const probe = http.createServer()
            probe.listen(p, '127.0.0.1', () => {
                probe.close(() => resolve(p))
            })
            probe.on('error', () => tryPort(p + 1))
        }
        tryPort(start)
    })
}

// Fallback working directory when no sandboxId is provided.
// server.ts lives at apps/web/bridge/ — three levels up is the repo root.
const DEFAULT_ROOT = process.env.CLAUDE_CODE_PROJECT_ROOT
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

// Directories to skip during sandbox → local sync
const SYNC_EXCLUDE = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.turbo',
    'coverage', '.cache', '.vercel', 'out', '.output', '.svelte-kit',
    '__pycache__', '.venv', 'venv',
])

// ─── JSX processing ───────────────────────────────────────────────────────────
// Mirrors CodeFileSystem.processJsxFile so that files written to the sandbox
// by Claude Code have the same OID annotations and preload script as files
// written through the API-token path.

const JSX_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js'])

function isJsxFile(filePath: string): boolean {
    const ext = filePath.slice(filePath.lastIndexOf('.'))
    return JSX_EXTENSIONS.has(ext)
}

async function processJsxFile(relPath: string, content: string): Promise<string> {
    const ast = getAstFromContent(content)
    if (!ast) {
        console.warn(`[bridge] Failed to parse ${relPath} — skipping OID injection`)
        return content
    }

    if (isRootLayoutFile(relPath, RouterType.APP)) {
        injectPreloadScript(ast)
    }

    const { ast: processedAst } = addOidsToAst(ast)
    const processed = await getContentFromAst(processedAst, content)
    return formatContent(relPath, processed)
}

// ─── Session registry ─────────────────────────────────────────────────────────

interface InteractiveSession {
    id: string
    claudeSessionId: string
    projectRoot: string
    proc: ChildProcess
    buffer: string
    activeRes: ServerResponse | null
    lastActivity: number
    sandboxCleanup?: () => Promise<void>
}

const sessions = new Map<string, InteractiveSession>()

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(root: string): string {
    const editorContext =
        'You are assisting a designer through the Onlook visual editor. ' +
        'Keep responses concise and focused. When editing files, make minimal ' +
        'targeted changes that match the existing code style.'

    const base = [
        SYSTEM_PROMPT,
        ONLOOK_INSTRUCTIONS,
        SHELL_PROMPT,
        editorContext,
    ].join('\n\n')

    try {
        const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8').trim()
        return `${base}\n\n${claudeMd}`
    } catch {
        return base
    }
}

// ─── Sandbox sync ─────────────────────────────────────────────────────────────

async function pullSandboxFiles(
    client: WebSocketSession,
    remotePath: string,
    localRoot: string,
    syncedTextContent: Map<string, string>,
): Promise<void> {
    let entries: Awaited<ReturnType<typeof client.fs.readdir>>
    try {
        entries = await client.fs.readdir(remotePath)
    } catch {
        return
    }

    for (const entry of entries) {
        if (SYNC_EXCLUDE.has(entry.name)) continue
        const rel = remotePath === './' ? entry.name : `${remotePath}/${entry.name}`
        const local = path.join(localRoot, rel)

        if (entry.type === 'directory') {
            await fsPromises.mkdir(local, { recursive: true })
            await pullSandboxFiles(client, rel, localRoot, syncedTextContent)
        } else if (entry.type === 'file' && !entry.isSymlink) {
            try {
                const content = await client.fs.readTextFile(rel)
                await fsPromises.mkdir(path.dirname(local), { recursive: true })
                await fsPromises.writeFile(local, content, 'utf-8')
                syncedTextContent.set(rel, content)
            } catch {
                // skip binary files and unreadable paths
            }
        }
    }
}

function classifySandboxError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()
    if (!process.env.CSB_API_KEY) return 'CSB_API_KEY is not configured in .env.local'
    if (lower.includes('401') || lower.includes('unauthorized')) return 'CSB_API_KEY is invalid or expired'
    if (lower.includes('unexpected server response')) return 'WebSocket connection to CodeSandbox failed — check CSB_API_KEY and network'
    return msg
}

async function setupSandboxSync(sandboxId: string): Promise<{
    localRoot: string
    cleanup: () => Promise<void>
}> {
    console.log(`[bridge] Connecting to sandbox ${sandboxId}…`)
    const sdk = new CodeSandbox()
    const sandbox = await sdk.sandboxes.resume(sandboxId)

    // Use createBrowserSession + connectToSandbox (browser bundle) instead of
    // sandbox.connect() — the latter uses the `ws` npm package which conflicts
    // with bun's native WebSocket ("Unexpected server response: 101").
    // connectToSandbox uses the native WebSocket global that bun supports.
    const session = await sandbox.createBrowserSession({})
    const client_ = await connectToSandbox({
        session,
        getSession: async (id) => {
            const s = await sdk.sandboxes.resume(id)
            return s.createBrowserSession({})
        },
    })

    const localRoot = path.join(os.tmpdir(), `onlook-bridge-${sandboxId}`)
    await fsPromises.mkdir(localRoot, { recursive: true })
    const syncedTextContent = new Map<string, string>()

    console.log(`[bridge] Syncing sandbox → ${localRoot}`)
    await pullSandboxFiles(client_, './', localRoot, syncedTextContent)
    console.log(`[bridge] Sync complete`)

    // Debounce map: path → timer, so rapid writes don't spam the sandbox WebSocket
    const pending = new Map<string, ReturnType<typeof setTimeout>>()

    const watcher = fs.watch(localRoot, { recursive: true }, (_, filename) => {
        if (!filename) return
        const rel = filename.replace(/\\/g, '/')
        const topLevel = rel.split('/')[0]
        if (topLevel && SYNC_EXCLUDE.has(topLevel)) return

        const existing = pending.get(rel)
        if (existing) clearTimeout(existing)

        pending.set(rel, setTimeout(async () => {
            pending.delete(rel)
            const localPath = path.join(localRoot, filename)
            try {
                const stat = await fsPromises.stat(localPath)
                if (stat.isDirectory()) return
                const localContent = await fsPromises.readFile(localPath, 'utf-8')
                let finalContent = localContent

                // Run the same JSX processing as CodeFileSystem.processJsxFile so
                // Claude Code's edits arrive in the sandbox with OID annotations and
                // the preload script — identical to the API-token editing path.
                if (isJsxFile(rel)) {
                    finalContent = await processJsxFile(rel, localContent)
                }

                const plan = getTextSyncPlan({
                    localContent,
                    finalContent,
                    lastSyncedContent: syncedTextContent.get(rel),
                })

                if (plan.shouldWriteLocal) {
                    await fsPromises.writeFile(localPath, plan.nextContent, 'utf-8')
                }

                if (!plan.shouldWriteRemote) {
                    return
                }

                await client_.fs.writeTextFile(rel, plan.nextContent)
                syncedTextContent.set(rel, plan.nextContent)
            } catch (err: unknown) {
                // File was deleted — remove it from the sandbox too
                if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
                    syncedTextContent.delete(rel)
                    await client_.fs.remove(rel).catch(() => {})
                }
                // Binary or other unreadable files — skip silently
            }
        }, 150))
    })

    const cleanup = async () => {
        watcher.close()
        for (const t of pending.values()) clearTimeout(t)
        pending.clear()
        syncedTextContent.clear()
        await client_.disconnect()
    }

    return { localRoot, cleanup }
}

// ─── Idle session cleanup ─────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
        if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
            console.log(`[bridge] Session ${id} idle >30min — cleaning up`)
            killProcess(session.proc)
            void session.sandboxCleanup?.()
            sessions.delete(id)
        }
    }
}, 60_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        req.on('error', reject)
    })
}

function setCors(res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
}

function sseHeaders(): Record<string, string> {
    return {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    }
}

// On Windows, spawning via `cmd /c claude` hits cmd.exe's ~8191-char command line limit,
// which the long --append-system-prompt value easily exceeds.  Resolve the actual
// claude.exe at startup so we can call CreateProcess directly (32 767-char limit).
function resolveClaudeExeWin32(): string | null {
    try {
        const result = spawnSync('where', ['claude.cmd'], { encoding: 'utf-8', shell: false })
        const lines = (result.stdout ?? '').trim().split('\n')
        for (const line of lines) {
            const cmdPath = line.trim()
            if (!cmdPath) continue
            const exePath = path.join(
                path.dirname(cmdPath),
                'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe',
            )
            if (fs.existsSync(exePath)) return exePath
        }
    } catch { /* ignore */ }
    return null
}

const CLAUDE_EXE_WIN32 = process.platform === 'win32' ? resolveClaudeExeWin32() : null

function claudeSpawn(args: string[], cwd: string, extraEnv?: Record<string, string>) {
    const env = { ...process.env, ...extraEnv }
    if (process.platform === 'win32') {
        if (CLAUDE_EXE_WIN32) {
            // Spawn the .exe directly — bypasses cmd.exe's 8 KB limit
            return spawn(CLAUDE_EXE_WIN32, args, { cwd, env, shell: false })
        }
        // Fallback for non-standard installs
        return spawn('cmd', ['/c', 'claude', ...args], { cwd, env, shell: false })
    }
    return spawn('claude', args, { cwd, env, shell: false })
}

function killProcess(proc: ChildProcess) {
    proc.kill()
    setTimeout(() => {
        if (!proc.killed && proc.pid) {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: false }).on('error', () => {})
            } else {
                try { process.kill(proc.pid, 'SIGKILL') } catch { /* already dead */ }
            }
        }
    }, 2000)
}

// ─── Session stdout handler ───────────────────────────────────────────────────

function attachSessionStdout(session: InteractiveSession) {
    session.proc.stdout!.on('data', (chunk: Buffer) => {
        session.buffer += chunk.toString()
        const lines = session.buffer.split('\n')
        session.buffer = lines.pop() ?? ''

        for (const line of lines) {
            if (!line.trim()) continue
            let raw: unknown
            try { raw = JSON.parse(line) } catch { continue }

            const events = parseStreamEvent(raw)

            for (const event of events) {
                if (event.type === 'text_delta') process.stdout.write(event.content)
                if (event.type === 'turn_end') process.stdout.write('\n')

                if (!session.activeRes) continue

                if (event.type === 'turn_end') {
                    session.activeRes.write('data: [DONE]\n\n')
                    session.activeRes.end()
                    session.activeRes = null
                } else {
                    session.activeRes.write(`data: ${JSON.stringify(event)}\n\n`)
                }
            }
        }
    })

    session.proc.stderr!.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk)
    })

    session.proc.on('close', (code) => {
        console.log(`[bridge] Session ${session.id} process exited (code ${code})`)
        if (session.activeRes) {
            const errEvent = { type: 'error', message: 'Claude process exited unexpectedly' }
            session.activeRes.write(`data: ${JSON.stringify(errEvent)}\n\n`)
            session.activeRes.write('data: [DONE]\n\n')
            session.activeRes.end()
            session.activeRes = null
        }
        void session.sandboxCleanup?.()
        sessions.delete(session.id)
    })
}

// ─── Session factory ──────────────────────────────────────────────────────────

function claudeSessionExists(projectRoot: string, sessionId: string): boolean {
    const hash = projectRoot.replace(/[:\\/]/g, '-')
    const sessionFile = path.join(os.homedir(), '.claude', 'projects', hash, `${sessionId}.jsonl`)
    return fs.existsSync(sessionFile)
}

interface CreateSessionOpts {
    clientId: string
    claudeSessionId: string
    projectRoot: string
    resumeId?: string
    sandboxCleanup?: () => Promise<void>
}

function spawnSession(opts: CreateSessionOpts): InteractiveSession {
    const { clientId, claudeSessionId, projectRoot, resumeId, sandboxCleanup } = opts
    const args = [
        '--print',
        '--verbose',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--permission-mode', 'bypassPermissions',
        '--append-system-prompt', buildSystemPrompt(projectRoot),
        ...(resumeId ?? claudeSessionExists(projectRoot, claudeSessionId)
            ? ['--resume', resumeId ?? claudeSessionId]
            : ['--session-id', claudeSessionId]),
    ]

    const proc = claudeSpawn(args, projectRoot)
    const session: InteractiveSession = {
        id: clientId,
        claudeSessionId,
        projectRoot,
        proc,
        buffer: '',
        activeRes: null,
        lastActivity: Date.now(),
        sandboxCleanup,
    }

    sessions.set(clientId, session)
    attachSessionStdout(session)
    return session
}

async function resolveProjectRoot(sandboxId?: string, explicitRoot?: string): Promise<{
    projectRoot: string
    sandboxCleanup?: () => Promise<void>
    sandboxError?: string
}> {
    if (sandboxId) {
        try {
            const sync = await setupSandboxSync(sandboxId)
            return { projectRoot: sync.localRoot, sandboxCleanup: sync.cleanup }
        } catch (err) {
            const sandboxError = classifySandboxError(err)
            console.error(`[bridge] Failed to sync sandbox ${sandboxId}: ${sandboxError}`)
            return { projectRoot: explicitRoot ?? DEFAULT_ROOT, sandboxError }
        }
    }
    return { projectRoot: explicitRoot ?? DEFAULT_ROOT }
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/'
    const method = req.method ?? 'GET'

    setCors(res)

    if (method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
    }

    // ── Health ────────────────────────────────────────────────────────────────
    if (url === '/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', defaultRoot: DEFAULT_ROOT }))
        return
    }

    // ── Create session ────────────────────────────────────────────────────────
    if (url === '/session/create' && method === 'POST') {
        let body: { sessionId?: string; sandboxId?: string; projectRoot?: string }
        try { body = JSON.parse(await readBody(req)) as typeof body }
        catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid json' })); return }

        const clientId = (body.sessionId ?? `chat-${Date.now()}`).trim()

        if (sessions.has(clientId)) {
            const existing = sessions.get(clientId)!
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, sessionId: clientId, claudeSessionId: existing.claudeSessionId }))
            return
        }

        const claudeSessionId = clientId
        const { projectRoot, sandboxCleanup, sandboxError } = await resolveProjectRoot(body.sandboxId, body.projectRoot)

        console.log(`[bridge] Creating session ${clientId} (cwd: ${projectRoot})`)
        spawnSession({ clientId, claudeSessionId, projectRoot, sandboxCleanup })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
            ok: true,
            sessionId: clientId,
            claudeSessionId,
            sandboxConnected: !sandboxError && !!body.sandboxId,
            ...(sandboxError && { sandboxError }),
        }))
        return
    }

    // ── Send message ──────────────────────────────────────────────────────────
    if (url === '/session/message' && method === 'POST') {
        let body: { sessionId?: string; message?: string; elementContext?: string }
        try { body = JSON.parse(await readBody(req)) as typeof body }
        catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid json' })); return }

        const { sessionId, elementContext } = body
        let { message } = body

        if (!sessionId || !message) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'sessionId and message are required' }))
            return
        }

        const session = sessions.get(sessionId)
        if (!session) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'session not found — call /session/create first' }))
            return
        }

        if (session.activeRes) {
            res.writeHead(409, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'session is already processing a message' }))
            return
        }

        if (elementContext) message = `${elementContext}\n\n${message}`

        res.writeHead(200, sseHeaders())
        session.activeRes = res
        session.lastActivity = Date.now()

        req.on('close', () => {
            if (session.activeRes === res) session.activeRes = null
        })

        const payload = JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n'
        session.proc.stdin!.write(payload, (err) => {
            if (err) {
                const errEvent = { type: 'error', message: err.message }
                session.activeRes?.write(`data: ${JSON.stringify(errEvent)}\n\n`)
                session.activeRes?.write('data: [DONE]\n\n')
                session.activeRes?.end()
                session.activeRes = null
            }
        })

        return
    }

    // ── Resume session ────────────────────────────────────────────────────────
    if (url === '/session/resume' && method === 'POST') {
        let body: { sessionId?: string; claudeSessionId?: string; sandboxId?: string; projectRoot?: string }
        try { body = JSON.parse(await readBody(req)) as typeof body }
        catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid json' })); return }

        const clientId = (body.sessionId ?? `chat-${Date.now()}`).trim()
        const resumeId = body.claudeSessionId

        if (!resumeId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'claudeSessionId is required for resume' }))
            return
        }

        const existing = sessions.get(clientId)
        if (existing) {
            killProcess(existing.proc)
            void existing.sandboxCleanup?.()
            sessions.delete(clientId)
        }

        const claudeSessionId = resumeId
        const { projectRoot, sandboxCleanup } = await resolveProjectRoot(body.sandboxId, body.projectRoot)

        console.log(`[bridge] Resuming session ${clientId} (claude: ${resumeId}, cwd: ${projectRoot})`)
        spawnSession({ clientId, claudeSessionId, projectRoot, resumeId, sandboxCleanup })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, sessionId: clientId, claudeSessionId }))
        return
    }

    // ── Delete session ────────────────────────────────────────────────────────
    const deleteMatch = /^\/session\/([^/]+)$/.exec(url)
    if (deleteMatch && method === 'DELETE') {
        const session = sessions.get(deleteMatch[1]!)
        if (session) {
            killProcess(session.proc)
            void session.sandboxCleanup?.()
            sessions.delete(session.id)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
    }

    // ── Session status ────────────────────────────────────────────────────────
    const statusMatch = /^\/session\/([^/]+)\/status$/.exec(url)
    if (statusMatch && method === 'GET') {
        const session = sessions.get(statusMatch[1]!)
        if (!session) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'session not found' }))
            return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
            alive: !session.proc.killed,
            claudeSessionId: session.claudeSessionId,
            lastActivity: session.lastActivity,
        }))
        return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
})

function shutdown() {
    fs.rmSync(PORT_FILE, { force: true })
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

findFreePort(PREFERRED_PORT).then(port => {
    actualPort = port
    if (port !== PREFERRED_PORT) {
        console.log(`[bridge] Port ${PREFERRED_PORT} is in use — using ${port} instead`)
    }
    fs.writeFileSync(PORT_FILE, String(port), 'utf-8')
    server.listen(port, '127.0.0.1', () => {
        console.log(`\n[bridge] Claude Code bridge running on http://localhost:${port}`)
        console.log(`[bridge] Default root: ${DEFAULT_ROOT}`)
        const csbKey = process.env.CSB_API_KEY
        if (csbKey) {
            console.log(`[bridge] CSB_API_KEY: ${csbKey.slice(0, 4)}…${csbKey.slice(-4)} (${csbKey.length} chars)`)
        } else {
            console.log(`[bridge] CSB_API_KEY: not set`)
        }
        console.log(`[bridge] Ready\n`)
    })
}).catch(err => {
    console.error('[bridge] Failed to find a free port:', err.message)
    process.exit(1)
})
