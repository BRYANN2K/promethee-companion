'use strict';
// Optional export of the live session for other local apps (e.g. a native notch UI).
// Writes ~/.local/state/promethee-companion/live.json ($XDG_STATE_HOME if set) atomically
// (temp file + rename, so a reader never sees half a file), only when the content changes and at
// most once per second. Schema: docs/NOTCH_EXPORT.md. Nothing leaves the machine.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA = 1;
const MIN_INTERVAL_MS = 1000;
const dir = () => path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'promethee-companion');
const file = () => path.join(dir(), 'live.json');

let lastKey = '', lastWrite = 0, pending = null, timer = null;
let alertKey = null, alertSince = null;   // when the current alert began (stable across writes)

// db: live status from lib/live.js (trackedSeconds already advanced to `now`), view: computeView(),
// host: who draws the notch ('electron' | 'boringnotch')
function build({ db, view, now = Date.now(), host = 'electron' }) {
  const active = !!(db && db.active);
  const st = view && view.stats;
  const ch = st && st.challenge;
  const state = db && db.error ? 'error' : !active ? 'idle' : db.paused ? 'paused' : 'running';
  let challenge = null;
  if (ch) {
    const left = ch.endsAt ? Math.max(0, Math.ceil((ch.endsAt - now) / 1000)) : ch.frozenSec;
    const b = (db.bonuses || []).find(x => x.id === ch.id);
    challenge = { xp: ch.xp, targetSeconds: b ? b.targetSec : null, remainingSeconds: left, endsAt: ch.endsAt || null };
  }
  const al = view && view.alert;
  const k = al ? al.returnTo + ':' + (db && db.sessionId) : null;
  if (k !== alertKey) { alertKey = k; alertSince = k ? now : null; }
  return {
    schema: SCHEMA,
    host,
    state,
    alerting: !!al,
    mode: view ? view.mode : 'idle',
    error: state === 'error' ? String(db.error) : null,
    session: active ? {
      id: db.sessionId,
      task: db.task || null,
      startedAt: db.startedAt,
      elapsedSeconds: Math.floor(db.trackedSeconds),
      wallSeconds: Math.floor((now - db.startedAt) / 1000),
      currentApp: db.currentApp || null,
      topApps: db.topDurable || [],
    } : null,
    stats: st ? {
      switches: st.switches,
      penalty: st.penalty,
      focus: st.focus,
      idleSeconds: st.idleSeconds,
      switchesPerHour: db.switchesPerHour ?? null,
      nextSwitchCost: db.nextSwitchCost ?? null,
      atCap: !!db.atCap,
      secondsToClearCap: db.secondsToClearCap || 0,
      lateStart: !!st.late,
    } : null,
    alert: al ? { returnTo: al.returnTo, startedAt: alertSince, deadlineAt: al.deadlineMs, windowMs: al.windowMs, exact: !!al.exact } : null,
    challenge,
    // target duration: Promethee has none for a session; the only target is an accepted bonus challenge
    target: challenge ? { seconds: challenge.targetSeconds, remainingSeconds: challenge.remainingSeconds } : null,
  };
}

function writeNow(obj) {
  const out = { ...obj, updatedAt: Date.now(), pid: process.pid };
  const f = file(), tmp = f + '.' + process.pid + '.tmp';
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
    fs.renameSync(tmp, f);
    lastWrite = Date.now();
  } catch { try { fs.unlinkSync(tmp); } catch {} }
}

// Call as often as you like: writes when the content changed, at most once per MIN_INTERVAL_MS
// (a change inside the window is written when it ends, so the last state is never lost).
function update(obj) {
  const key = JSON.stringify(obj);
  if (key === lastKey) return;
  lastKey = key;
  const wait = lastWrite + MIN_INTERVAL_MS - Date.now();
  if (wait <= 0) { clearTimeout(timer); timer = null; writeNow(obj); return; }
  pending = obj;
  if (!timer) timer = setTimeout(() => { timer = null; const p = pending; pending = null; if (p) writeNow(p); }, wait);
}

// On quit: say so, so a reader does not show a frozen session.
function stop() {
  clearTimeout(timer); timer = null; pending = null;
  writeNow({ schema: SCHEMA, host: null, state: 'stopped', alerting: false, mode: 'idle', error: null, session: null, stats: null, alert: null, challenge: null, target: null });
}

module.exports = { build, update, stop, file };
