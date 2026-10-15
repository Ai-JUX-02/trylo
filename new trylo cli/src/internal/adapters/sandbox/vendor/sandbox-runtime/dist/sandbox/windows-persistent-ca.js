// ── trylo WP04 local patch (documented in PATCHES.md) ──────────────────
// Split out of windows-sandbox-utils.js. This cluster is the only
// consumer of node-forge on the Windows sandbox path: it issues and validates
// the self-signed MITM CA that TLS termination needs. The CONNECT/SOCKS
// allowlist paths do not use it, so keeping it in its own module keeps
// node-forge off their import graph. Body unchanged.
//
// A verbatim move still has to re-import what the body closes over — these
// five identifiers were file-local in windows-sandbox-utils.js and would
// otherwise be unbound here (a ReferenceError at first use, not a load
// error). windowsStateDir/windowsTrustCaAsync come from the utils module;
// the three CA primitives are the forge-bearing edge, and it belongs HERE,
// at the end of the split, not back on the allowlist path.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logForDebugging } from '../utils/debug.js';
import { getWindowsSandboxUserStatusAsync, windowsStateDir, windowsTrustCaAsync, } from './windows-sandbox-utils.js';
import { certThumbprint, generateCa, validateCaPair } from './mitm-ca.js';

export async function ensurePersistentWindowsCa(opts = {}) {
    // Provisioning gate. The `ca/` subdirectory's whole custody story
    // depends on inheriting the state-DB dir's stamped DACL — which
    // `srt-win install` creates. Never mkdir the state dir here.
    const status = opts.status ??
        (await getWindowsSandboxUserStatusAsync({ srtWin: opts.srtWin }));
    if (!status.provisioned || !status.credPresent) {
        throw new Error(`ensurePersistentWindowsCa: sandbox user is not provisioned ` +
            `(user=${status.provisioned}, cred=${status.credPresent}). ` +
            `Run \`npx sandbox-runtime windows-install\` first.`);
    }
    const stateDir = opts.dir ? undefined : windowsStateDir();
    if (stateDir && !fs.existsSync(stateDir)) {
        throw new Error(`ensurePersistentWindowsCa: state directory ${stateDir} does not ` +
            `exist. Run \`npx sandbox-runtime windows-install\` first.`);
    }
    const dir = opts.dir ?? path.win32.join(stateDir, 'ca');
    const jsonPath = path.join(dir, 'ca.json');
    const certPath = path.join(dir, 'cert.pem');
    const keyPath = path.join(dir, 'key.pem');
    const horizonMs = (opts.regenerateWithinDays ?? 30) * 24 * 60 * 60 * 1000;
    // tmp+rename atomic write. Node's `renameSync` on Windows is
    // libuv's `MoveFileExW(…, MOVEFILE_REPLACE_EXISTING)` — an atomic
    // same-volume replace — so `p` is either its previous content or
    // the full new content, never partial.
    const atomicWrite = (p, data) => {
        const tmp = `${p}.tmp.${process.pid}`;
        fs.writeFileSync(tmp, data);
        fs.renameSync(tmp, p);
    };
    // Shared return path: write the derived cert.pem/key.pem siblings
    // (tooling-only — trust-ca never reads them), reconcile trust, and
    // assemble the result. Trust is idempotent and ADDITIVE: `srt-win
    // user trust-ca` writes a per-thumbprint registry key (a rotation
    // adds the new cert, prior ones stay trusted); the state-DB
    // `ca_cert` column tracks the latest.
    const finish = async (certPem, keyPem, thumbprint, generated) => {
        atomicWrite(certPath, certPem);
        atomicWrite(keyPath, keyPem);
        const trusted = generated || status.caCertThumb !== thumbprint;
        if (trusted) {
            // Trust from a per-call unique temp, never a shared mutable
            // path — a concurrent broker's write to `cert.pem` could
            // otherwise swap the bytes between our write and `srt-win user
            // trust-ca`'s read, leaving the registry trusting a different
            // cert than this session's proxy signs with.
            const t = path.join(dir, `.trust.${process.pid}.${Date.now()}.pem`);
            fs.writeFileSync(t, certPem);
            try {
                await windowsTrustCaAsync(t, { srtWin: opts.srtWin });
            }
            finally {
                fs.rmSync(t, { force: true });
            }
        }
        logForDebugging(`[Sandbox Windows] persistent CA ` +
            `${generated ? 'generated' : 'reused'} (thumb=${thumbprint}` +
            `${trusted && !generated ? ', trust reconciled' : ''})`);
        return {
            certPem,
            keyPem,
            certPath,
            keyPath,
            thumbprint,
            generated,
            trusted,
        };
    };
    // Read+validate helper. Any read/parse/validate failure returns
    // undefined (never throws) so a corrupt on-disk pair is not an
    // error the embedder has to handle.
    const readValid = () => {
        let stored;
        try {
            stored = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
        catch (err) {
            logForDebugging(`[Sandbox Windows] persistent CA ca.json unreadable ` +
                `(${err.message})`, { level: 'warn' });
            return undefined;
        }
        if (typeof stored.certPem !== 'string' || typeof stored.keyPem !== 'string')
            return undefined;
        const v = validateCaPair(stored.certPem, stored.keyPem);
        if (!v.ok) {
            logForDebugging(`[Sandbox Windows] persistent CA invalid (${v.reason})`, {
                level: 'warn',
            });
            return undefined;
        }
        return {
            certPem: stored.certPem,
            keyPem: stored.keyPem,
            thumbprint: v.thumbprint,
            notAfter: v.notAfter,
        };
    };
    // Reuse when ca.json exists, validates, and isn't expiring inside
    // the horizon.
    if (!opts.force) {
        const on = readValid();
        if (on && on.notAfter.getTime() - Date.now() > horizonMs) {
            return await finish(on.certPem, on.keyPem, on.thumbprint, false);
        }
        if (on) {
            logForDebugging(`[Sandbox Windows] persistent CA expiring ` +
                `${on.notAfter.toISOString()}; regenerating`, { level: 'warn' });
        }
    }
    // Generate. `ca/` (not the state dir) is mkdir'd here so it
    // inherits the parent's (OI)(CI) DACL. After the atomic write,
    // RE-READ ca.json and use that content: a concurrent broker's
    // rename may have won, and returning our own PEMs would diverge
    // from disk — the re-read makes every racer converge.
    fs.mkdirSync(dir, { recursive: true });
    // Best-effort sweep of stale `*.tmp.*` / `.trust.*` files from
    // crashed prior brokers.
    try {
        const cutoff = Date.now() - 5 * 60 * 1000;
        for (const f of fs.readdirSync(dir)) {
            if (!f.includes('.tmp.') && !f.startsWith('.trust.'))
                continue;
            const p = path.join(dir, f);
            if (fs.statSync(p).mtimeMs < cutoff)
                fs.rmSync(p, { force: true });
        }
    }
    catch {
        // sweep is best-effort; a leftover tmp is harmless.
    }
    const gen = generateCa({ cn: 'sandbox-runtime persistent CA' });
    atomicWrite(jsonPath, JSON.stringify({ certPem: gen.certPem, keyPem: gen.keyPem }));
    const on = readValid();
    // `on` can only be undefined if a concurrent broker overwrote with
    // an invalid pair (which the tmp+rename path can't produce) — so
    // treat as our own write having landed.
    const { certPem, keyPem, thumbprint } = on ?? {
        certPem: gen.certPem,
        keyPem: gen.keyPem,
        thumbprint: certThumbprint(gen.certPem),
    };
    return await finish(certPem, keyPem, thumbprint, true);
}
