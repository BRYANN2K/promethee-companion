'use strict';
// Who draws the companion in the notch (macOS, notch-export branch only).
// The boringNotch fork with the WorkspaceHUD bus reads live.json and renders the session and the
// angry pop-out natively. When it runs, the Electron notch window stays hidden and the companion
// only feeds live.json. Setting: config.json "notchHost": "auto" (default) | "electron" | "boringnotch".
// Detection: a running process named "Boring Notch" whose app bundle's Info.plist has
// WorkspaceHUDBus = true. Checked every few seconds (pgrep + ps + plutil, no permission needed).
const { execFile } = require('child_process');

const PROC = 'Boring Notch';
const run = (cmd, args) => new Promise(res => execFile(cmd, args, { encoding: 'utf8', timeout: 3000 }, (e, out) => res(e ? '' : String(out).trim())));

async function busRunning() {
  if (process.platform !== 'darwin') return false;
  const pids = (await run('/usr/bin/pgrep', ['-x', PROC])).split('\n').filter(Boolean);
  for (const pid of pids) {
    const exe = await run('/bin/ps', ['-o', 'comm=', '-p', pid]);
    const m = /^(.*?\.app)\/Contents\/MacOS\//.exec(exe);
    if (!m) continue;
    if ((await run('/usr/bin/plutil', ['-extract', 'WorkspaceHUDBus', 'raw', m[1] + '/Contents/Info.plist'])) === 'true') return true;
  }
  return false;
}

// host(setting) -> 'boringnotch' | 'electron'
async function resolveHost(setting) {
  if (setting === 'electron' || setting === 'boringnotch') return setting;
  return (await busRunning()) ? 'boringnotch' : 'electron';
}

module.exports = { resolveHost, busRunning };
