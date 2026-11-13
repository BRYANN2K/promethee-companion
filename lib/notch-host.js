'use strict';
// Who draws the companion in the notch (macOS, notch-export branch only). Contract: docs/NOTCH_EXPORT.md.
// A "notch host" is any app that reads live.json and renders the mascot itself (the planned
// promethee-notch app, the boringNotch fork...). While a live host is present, the Electron notch
// window stays hidden and the companion only writes live.json.
// A host announces itself in two ways:
//   1. generic: it keeps a heartbeat file host.json {name, version, pid, updatedAt} next to
//      live.json (rewritten at least every 5 s); live = its pid runs and updatedAt < 15 s old.
//   2. built in, for the boringNotch fork: a running "Boring Notch" process whose app bundle's
//      Info.plist has WorkspaceHUDBus = true.
// Setting: config.json "notchHost": "auto" (default) | "electron" (never hand over) | "host" (always hide).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const HEARTBEAT_MAX_AGE_MS = 15000;
const run = (cmd, args) => new Promise(res => execFile(cmd, args, { encoding: 'utf8', timeout: 3000 }, (e, out) => res(e ? '' : String(out).trim())));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

function heartbeatHost(dir) {
  try {
    const h = JSON.parse(fs.readFileSync(path.join(dir, 'host.json'), 'utf8'));
    const pid = Number(h.pid), at = Number(h.updatedAt);
    if (!h.name || !Number.isInteger(pid) || pid <= 0 || !alive(pid)) return null;
    if (!(Date.now() - at < HEARTBEAT_MAX_AGE_MS)) return null;
    return String(h.name).slice(0, 64);
  } catch { return null; }
}

async function boringNotchBus() {
  const pids = (await run('/usr/bin/pgrep', ['-x', 'Boring Notch'])).split('\n').filter(Boolean);
  for (const pid of pids) {
    const exe = await run('/bin/ps', ['-o', 'comm=', '-p', pid]);
    const m = /^(.*?\.app)\/Contents\/MacOS\//.exec(exe);
    if (m && (await run('/usr/bin/plutil', ['-extract', 'WorkspaceHUDBus', 'raw', m[1] + '/Contents/Info.plist'])) === 'true') return true;
  }
  return false;
}

// -> name of the live host ('promethee-notch', 'boringnotch', ...) or null (the window draws it)
async function detectHost(dir, setting = 'auto') {
  if (process.platform !== 'darwin' || setting === 'electron') return null;
  const hb = heartbeatHost(dir);
  if (hb) return hb;
  if (await boringNotchBus()) return 'boringnotch';
  return setting === 'host' ? 'external' : null;
}

module.exports = { detectHost, heartbeatHost };
