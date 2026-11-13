# Notch export (live.json)

Local integration for a native notch UI (the boringNotch fork with the WorkspaceHUD bus). Not part of
the upstream project.

## File

- Path: `~/.local/state/promethee-companion/live.json` (`$XDG_STATE_HOME/promethee-companion/live.json`
  if `XDG_STATE_HOME` is set).
- Written atomically: a temp file in the same folder, then `rename`. A reader never sees half a file.
- Written only when the content changes, at most once per second. While a session runs,
  `elapsedSeconds` changes every second, so expect about one write per second; with no session, none.
- On quit the companion writes `"state": "stopped"`. If the process died without that, `updatedAt`
  stops moving and `pid` is gone: treat a file older than ~5 s as stale.
- Settings in the companion's `config.json` (`~/Library/Application Support/Promethee Companion/`):
  - `"notchExport": false` turns the export off (on by default in this branch).
  - `"notchHost": "auto" | "electron" | "boringnotch"`. `auto` (default): when a process named
    `Boring Notch` runs and its bundle's `Info.plist` has `WorkspaceHUDBus = true`, the Electron notch
    window stays hidden and only this file is written. Checked every 5 s.

## Schema (`schema: 1`)

| Field | Type | Meaning |
|---|---|---|
| `schema` | number | `1`. Bumped on breaking changes. |
| `host` | `"electron"` \| `"boringnotch"` \| null | Who draws the notch right now. `null` when stopped. |
| `state` | `"running"` \| `"paused"` \| `"idle"` \| `"error"` \| `"stopped"` | Session state. `idle` = no session. |
| `alerting` | bool | True while the "back to your app" alert is on (the angry pop-out). |
| `mode` | `"idle"` \| `"focus"` \| `"alert"` | What the Electron companion shows. |
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
