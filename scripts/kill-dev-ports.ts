/**
 * kill-dev-ports.ts
 *
 * Frees ports used by dev:cc before starting the dev server.
 * Ports: 3000 (Next.js), 8083 (preload server), 4567 (bridge)
 *
 * Usage: bun scripts/kill-dev-ports.ts
 */

const PORTS = [3000, 8083, 4567];

if (process.platform === 'win32') {
    for (const port of PORTS) {
        const result = Bun.spawnSync(
            ['powershell', '-NoProfile', '-Command',
                `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; ` +
                `if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; ` +
                `Write-Host "Freed port ${port}" } else { Write-Host "Port ${port} is free" }`
            ],
            { stdout: 'inherit', stderr: 'ignore' },
        );
        if (result.exitCode !== 0) {
            // Fallback: netstat + taskkill (no PowerShell execution policy issues)
            const find = Bun.spawnSync(
                ['cmd', '/c', `netstat -ano | findstr :${port} | findstr LISTENING`],
                { stdout: 'pipe', stderr: 'ignore' },
            );
            const out = new TextDecoder().decode(find.stdout ?? new Uint8Array());
            const pid = out.trim().split(/\s+/).at(-1);
            if (pid && /^\d+$/.test(pid)) {
                Bun.spawnSync(['taskkill', '/PID', pid, '/F'], { stdout: 'ignore', stderr: 'ignore' });
                console.log(`Freed port ${port} (PID ${pid})`);
            }
        }
    }
} else {
    // Mac / Linux
    for (const port of PORTS) {
        Bun.spawnSync(
            ['sh', '-c', `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`],
            { stdout: 'inherit', stderr: 'ignore' },
        );
        console.log(`Port ${port} cleared`);
    }
}
