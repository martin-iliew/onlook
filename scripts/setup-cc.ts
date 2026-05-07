/**
 * setup-cc.ts
 *
 * One-time setup for Claude Code mode. Writes .env.local so you don't have to
 * fill in Supabase keys manually. Re-run any time to refresh the keys.
 *
 * Usage:
 *   bun run setup:cc              # local Supabase via Docker
 *   bun run setup:cc -- --remote  # remote Supabase (no Docker needed)
 *
 * Prerequisites (local mode):
 *   - Claude Code CLI installed (claude --version)
 *   - Docker Desktop running
 *   - bun run backend:start has been run at least once
 *
 * Prerequisites (remote mode):
 *   - Claude Code CLI installed (claude --version)
 *   - A Supabase project at https://supabase.com
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as readline from 'node:readline'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = path.join(ROOT, 'apps/web/client/.env.local')
const SUPABASE_DIR = path.join(ROOT, 'apps/backend')

// Standard Supabase local demo keys — used as fallback when Supabase isn't running
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7w1heRnAo-vKlVGrDtAo6N6W6hpfNJnGxKc'
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0'

interface SupabaseKeys {
    anonKey: string
    serviceRoleKey: string
    url: string
    dbUrl: string
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve))
}

function parseEnvValue(env: string, key: string): string {
    return env.match(new RegExp(`^${key}=(.+)`, 'm'))?.[1]?.trim() ?? ''
}

function getExistingRemoteKeys(envContent: string): SupabaseKeys | null {
    const url = parseEnvValue(envContent, 'NEXT_PUBLIC_SUPABASE_URL')
    const anonKey = parseEnvValue(envContent, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
    const serviceRoleKey = parseEnvValue(envContent, 'SUPABASE_SERVICE_ROLE_KEY')
    const dbUrl = parseEnvValue(envContent, 'SUPABASE_DATABASE_URL')

    if (url && anonKey && serviceRoleKey && dbUrl) {
        return { url, anonKey, serviceRoleKey, dbUrl }
    }
    return null
}

async function getRemoteKeys(existingEnv: string): Promise<SupabaseKeys> {
    const existing = getExistingRemoteKeys(existingEnv)
    if (existing) {
        console.log('✓ Supabase credentials found in .env.local — skipping prompts')
        return existing
    }

    console.log('Enter your Supabase project credentials.')
    console.log('Find them at: https://supabase.com/dashboard → your project → Settings → API\n')

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

    const url = await prompt(rl, 'Project URL (https://xxxx.supabase.co): ')
    const anonKey = await prompt(rl, 'Anon public key: ')
    const serviceRoleKey = await prompt(rl, 'Service role key: ')
    const dbUrl = await prompt(rl, 'Database URL (postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres): ')

    rl.close()
    return { url: url.trim(), anonKey: anonKey.trim(), serviceRoleKey: serviceRoleKey.trim(), dbUrl: dbUrl.trim() }
}

function getLocalKeys(): SupabaseKeys {
    const defaults: SupabaseKeys = {
        anonKey: FALLBACK_ANON_KEY,
        serviceRoleKey: FALLBACK_SERVICE_ROLE_KEY,
        url: 'http://127.0.0.1:54321',
        dbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    }

    try {
        const output = execSync('supabase status', {
            cwd: SUPABASE_DIR,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        })
        const extract = (label: string) => output.match(new RegExp(`${label}:\\s*(.+)`))?.[1]?.trim()
        return {
            anonKey: extract('anon key') ?? extract('Publishable key') ?? defaults.anonKey,
            serviceRoleKey: extract('service_role key') ?? extract('Secret key') ?? defaults.serviceRoleKey,
            url: extract('API URL') ?? defaults.url,
            dbUrl: extract('DB URL') ?? extract('Database URL') ?? defaults.dbUrl,
        }
    } catch {
        return defaults
    }
}

async function main() {
    const isRemote = process.argv.includes('--remote')

    console.log(`Setting up Claude Code mode for Onlook (${isRemote ? 'remote' : 'local'} Supabase)...\n`)

    try {
        execSync('claude --version', { stdio: 'ignore' })
        console.log('✓ Claude Code CLI found')
    } catch {
        console.warn('⚠  Claude Code CLI not found. Install it from https://claude.ai/code\n')
    }

    let existing = ''
    try { existing = fs.readFileSync(ENV_FILE, 'utf-8') } catch { /* new file */ }

    let keys: SupabaseKeys
    let usingFallback = false

    if (isRemote) {
        keys = await getRemoteKeys(existing)
        console.log('\n✓ Remote Supabase credentials received')
    } else {
        keys = getLocalKeys()
        usingFallback = keys.anonKey === FALLBACK_ANON_KEY
        if (usingFallback) {
            console.log('⚠  Supabase not running — using fallback keys.')
            console.log('   Run `bun run backend:start` first, then re-run this script.\n')
        } else {
            console.log('✓ Supabase keys read from running instance')
        }
    }

    // Block delimited by a unique comment so it can be replaced on re-runs
    const mode = isRemote ? 'remote' : 'local'
    const block = `# Claude Code mode (${mode}) — generated by bun run setup:cc (do not commit)
NEXT_PUBLIC_USE_CLAUDE_CODE=true
NEXT_PUBLIC_SUPABASE_URL=${keys.url}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${keys.anonKey}
SUPABASE_DATABASE_URL=${keys.dbUrl}
SUPABASE_SERVICE_ROLE_KEY=${keys.serviceRoleKey}
OPENROUTER_API_KEY=local-dev-unused
CSB_API_KEY=local-dev-unused
# end claude code mode`

    const stripped = existing
        .replace(/# Claude Code mode[\s\S]*?# end claude code mode\n?/m, '')
        .trimEnd()

    fs.writeFileSync(ENV_FILE, stripped ? `${stripped}\n\n${block}\n` : `${block}\n`, 'utf-8')
    console.log(`✓ Written to ${ENV_FILE}`)

    const DB_ENV_FILE = path.join(ROOT, 'packages/db/.env')
    const dbEnvContent = [
        `SUPABASE_DATABASE_URL=${keys.dbUrl}`,
        `SUPABASE_SERVICE_ROLE_KEY=${keys.serviceRoleKey}`,
        `SUPABASE_URL=${keys.url}`,
        '',
    ].join('\n')
    fs.writeFileSync(DB_ENV_FILE, dbEnvContent, 'utf-8')
    console.log(`✓ Written to ${DB_ENV_FILE}`)

    console.log('\n─────────────────────────────────────────')
    if (isRemote) {
        console.log('Ready to go (remote Supabase):\n')
        console.log('  bun run dev:cc\n')
        console.log('To switch back to local:  bun run setup:cc')
    } else if (usingFallback) {
        console.log('Run in this order:\n')
        console.log('  1. bun run backend:start   (start Supabase — requires Docker)')
        console.log('  2. bun run setup:cc        (re-run to get real keys)')
        console.log('  3. bun run dev:cc\n')
        console.log('No Docker? Use remote instead:  bun run setup:cc -- --remote')
    } else {
        console.log('Ready to go (local Supabase):\n')
        console.log('  bun run dev:cc\n')
        console.log('Open http://localhost:3000 and create a local account.')
        console.log('To switch to remote:  bun run setup:cc -- --remote')
    }
    console.log('─────────────────────────────────────────\n')
}

main()
