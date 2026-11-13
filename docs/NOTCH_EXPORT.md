# Notch host contract (live.json + host.json)

Local integration for native notch apps ("notch hosts": the planned promethee-notch app, the
boringNotch fork with the WorkspaceHUD bus...). Not part of the upstream project. Without a host, the
companion draws the notch itself (hidden in the notch, springs out on a switch). With a live host,
it hides its window and the host renders the mascot from `live.json`.

Folder: `~/.local/state/promethee-companion/` (`$XDG_STATE_HOME/promethee-companion/` if set).

| File | Written by | Purpose |
|---|---|---|
| `live.json` | the companion | session and mascot state, see the schema below |
| `host.json` | the notch host | heartbeat: "I draw the notch" |

## host.json (written by the host)

```json
{ "name": "promethee-notch", "version": 1, "pid": 4242, "updatedAt": 1794611385454 }
```

- `name`: short id shown in the companion's menu and copied to `live.json` `host`.
- `version`: the `live.json` contract version the host understands (currently `1`).
- `pid`: the host process. `updatedAt`: ms epoch; rewrite the file (atomically) at least every 5 s.
- The host is live while `pid` runs and `updatedAt` is less than 15 s old. Delete the file on quit.
- The companion checks every 5 s. Built-in fallback for the boringNotch fork: a running process named
  `Boring Notch` whose bundle `Info.plist` has `WorkspaceHUDBus = true` counts as a live host named
  `boringnotch`, without a heartbeat.

## live.json (written by the companion)

- Written atomically: a temp file in the same folder, then `rename`. A reader never sees half a file.
- Written only when the content changes, at most once per second. While a session runs,
  `elapsedSeconds` changes every second, so expect about one write per second; with no session, none.
- On quit the companion writes `"state": "stopped"`. If the process died without that, `updatedAt`
  stops moving and `pid` is gone: treat a file older than ~5 s as stale.
- Settings in the companion's `config.json` (`~/Library/Application Support/Promethee Companion/`):
  - `"notchExport": false` turns the export off (on by default in this branch).
  - `"notchHost": "auto" | "electron" | "host"`. `auto` (default): hand the notch to a live host.
    `electron`: never hand over. `host`: always hide the window (host named `external` if none is
    detected). The hand-over only applies to the notch placement, not the bottom-right one.

### Schema (`version: 1`)

| Field | Type | Meaning |
|---|---|---|
| `version` | number | Contract version, `1`. Bumped on breaking changes; new fields can appear without a bump. |
| `host` | string \| null | Who draws the notch now: `"electron"` (the companion window) or the host's `name`. `null` when stopped. |
| `state` | `"running"` \| `"paused"` \| `"idle"` \| `"error"` \| `"stopped"` | Session state. `idle` = no session. |
| `alerting` | bool | True while the "back to your app" alert is on (the angry pop-out). |
| `mode` | `"idle"` \| `"focus"` \| `"alert"` | Mascot state: idle = sleeping (no session or paused), focus = calm, alert = angry with flames. |
| `error` | string \| null | Why the DB could not be read (`state: "error"`). |
| `session` | object \| null | Null unless a session is running or paused. |
| `session.id` | string | Promethee session id. |
| `session.task` | string \| null | Task text typed in Promethee. |
| `session.startedAt` | ms epoch | Session start. |
| `session.elapsedSeconds` | number | Credited time (wall time minus pauses), like Promethee. |
| `session.wallSeconds` | number | Wall time since start. |
| `session.currentApp` | string \| null | Last app Promethee sampled. |
| `session.topApps` | `[{app, minutes}]` | Up to 4 apps by durable time. |
| `stats` | object \| null | Null with no session. |
| `stats.switches` | number | Counted app switches. |
| `stats.penalty` | number | Switch penalty in points (0 to 35). |
| `stats.focus` | number | Focus score 0 to 100 (switches + idle). |
| `stats.idleSeconds` | number | Idle time counted so far. |
| `stats.switchesPerHour` | number \| null | Switch rate. |
| `stats.nextSwitchCost` | number \| null | Points one more switch would cost now. |
| `stats.atCap` | bool | Penalty is at its 35 point cap. |
| `stats.secondsToClearCap` | number | Time without a switch until the penalty drops below the cap. |
| `stats.lateStart` | bool | Companion started after the session began (idle before that unknown). |
| `alert` | object \| null | Set while `alerting`. |
| `alert.returnTo` | string | App to go back to. |
| `alert.startedAt` | ms epoch | When this alert began. |
| `alert.deadlineAt` | ms epoch | When Promethee counts the switch if you do not go back. |
| `alert.windowMs` | number | Full length of the grace bar (ms). |
| `alert.exact` | bool | Deadline confirmed by Promethee's DB (false = predicted). |
| `challenge` | object \| null | Accepted "stay X more minutes" bonus challenge. |
| `challenge.xp` | number | XP it grants. |
| `challenge.targetSeconds` | number \| null | Credited time it requires. |
| `challenge.remainingSeconds` | number | Time left. |
| `challenge.endsAt` | ms epoch \| null | Wall-clock end; null while paused. |
| `target` | object \| null | `{seconds, remainingSeconds}`. Promethee sessions have no planned length: this is the challenge target, else null. |
| `updatedAt` | ms epoch | Write time. |
| `pid` | number | Companion process id. |

A countdown in the reader should use `alert.deadlineAt - now` and `challenge.endsAt - now`
rather than waiting for the next write.
