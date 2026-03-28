---
name: openclaw-home-control
description: Use when OpenClaw needs to operate the Hackaway home console through HTTP APIs. Covers room-aware control of lights, windows, doors, TVs, climate units, robot cleaning, and multi-step scene execution. Always read the latest home state first, use only the capability-based endpoints under /api/devices/* plus /api/actions/batch, and never use the removed legacy /api/devices/:id/* routes.
---

# OpenClaw Home Control

Use this skill when the task is to inspect or control the Hackaway home console.

This skill is optimized for:
- Natural-language room automation
- Multi-step “scene” execution
- Safe selection of devices by room or capability
- Robot cleaning tasks that should not require geometry planning

Do not use this skill for:
- Editing the floorplan document directly
- Frontend UI work
- Any route under the removed legacy format `/api/devices/:id/...`

## Hard Rules

1. Always start with `GET /api/home/state` unless the user explicitly asks for a blind fire-and-forget action.
2. Never assume a room has a specific device. Inspect `state.devices` first.
3. Never use the old path format `/api/devices/:id/...`. Only use capability paths such as `/api/devices/light/power`.
4. Prefer `POST /api/actions/batch` for multi-step scenes so the server returns one combined result and one final home state.
5. Use `roomId`, `roomIds`, `all`, and `excludeRoomIds` whenever possible. Use direct device ids only when the user refers to a specific physical device or when the capability requires a single robot target.
6. For robot cleaning, prefer `POST /api/devices/robot/clean` over manually building geometry routes.
7. Treat batch execution as non-atomic. If an earlier step succeeds and a later step fails, the earlier change remains applied.
8. If a step is desirable but not guaranteed to match a device, mark that batch action as `"optional": true`.

## Workflow

1. Read the current world with `GET /api/home/state`.
2. Identify the room ids and relevant devices from `state.rooms` and `state.devices`.
3. Translate the user goal into concrete effects:
   - Light power and mode
   - Window or door open state
   - TV power
   - Climate power, temperature, or preset
   - Robot stop, route, or clean scope
4. If more than one change is required, send a single `POST /api/actions/batch`.
5. Review the returned final `state` and summarize the resulting room/device state.

## Selector Rules

Most capability endpoints accept one target selector in the request body:
- `id`: one device
- `ids`: a list of devices of the same capability
- `roomId`: all matching devices in one room
- `roomIds`: all matching devices across listed rooms
- `all: true`: all devices of that capability

Optional refinements:
- `excludeRoomIds`: remove specific rooms from the match set

Examples:
- Turn off every light: `{ "all": true, "power": false }`
- Set bedroom lights to night mode: `{ "roomId": "room-bedroom", "mode": "night" }`
- Close windows except the studio: `{ "all": true, "excludeRoomIds": ["room-studio"], "open": false }`

## Robot Rules

Robot targeting is slightly different:
- `id`, `ids`, or `all` selects the robot device itself
- For `POST /api/devices/robot/clean`, `roomId`, `roomIds`, or `scope: "home"` defines where the robot should clean

Examples:
- Clean one room: `{ "id": "device-robot", "roomId": "room-kitchen", "loop": false }`
- Clean whole home: `{ "id": "device-robot", "scope": "home", "loop": false }`
- Stop any robot activity: `{ "all": true, "status": "idle" }`

## Climate Rules

Use these defaults unless the user specifies otherwise:
- `sleep` preset: restful temperature
- `comfort` preset: comfortable active occupancy
- `away` preset: energy-saving state

Important behavior:
- `POST /api/devices/climate/preset` with `sleep` or `comfort` turns the matched unit on
- `away` sets the unit to an away temperature and defaults to off unless `"power": true` is also provided

Prefer presets for natural-language requests such as:
- “I’m going to rest”
- “Make it comfortable”
- “I left home”

Prefer direct `targetTemperature` only when the user explicitly gives a number.

## Light Rules

Supported light modes:
- `cozy`
- `focus`
- `daylight`
- `night`

Important behavior:
- `POST /api/devices/light/mode` turns matched lights on while applying the mode

This makes “only keep bedroom lights in night mode” easy:
1. Turn all lights off
2. Apply bedroom `night` mode

## Batch Strategy

Use `POST /api/actions/batch` whenever:
- The user asks for a routine, scene, or multiple device changes
- Ordering matters
- A final single response is preferable

Recommended batch settings:
- Default to `continueOnError: false`
- Use per-action `"optional": true` for nice-to-have steps

Examples of optional steps:
- A room might not contain lights
- A specific room may not contain an AC
- The current floorplan may omit a TV

## References

Read these before writing complex control payloads:
- Full endpoint and payload contract: [references/api-reference.md](references/api-reference.md)
- Ready-to-use scene patterns: [references/playbooks.md](references/playbooks.md)
