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
- Smart fridge inventory management and temperature control

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

## Fridge Rules

The fridge device tracks door state, temperatures, and inventory across two compartments (fridge and freezer).

Endpoints:
- `POST /api/devices/fridge/door` — open or close the door: `{ "id": "...", "open": true }`
- `POST /api/devices/fridge/temperature` — set temperatures: `{ "id": "...", "fridgeTemperature": 4, "freezerTemperature": -18 }`
- `POST /api/devices/fridge/items` — manage inventory

Item management actions:
- Add: `{ "id": "...", "action": "add", "compartment": "fridge", "item": { "name": "Milk", "quantity": 1, "unit": "L" } }`
- Remove: `{ "id": "...", "action": "remove", "compartment": "fridge", "itemName": "Milk" }`
- Clear: `{ "id": "...", "action": "clear", "compartment": "fridge" }`
- Set all: `{ "id": "...", "action": "set", "compartment": "fridge", "items": [...] }`

Temperature ranges:
- Fridge: 1°C to 8°C (default 4°C)
- Freezer: -25°C to -10°C (default -18°C)

Heuristics:
- "What's in the fridge?" → Read state and list fridgeItems + freezerItems
- "Add milk" → Use fridge/items with action "add"
- "I used the eggs" → Use fridge/items with action "remove"
- "Set fridge colder" → Decrease fridgeTemperature by 1-2 degrees

### Picnic Integration — Fridge Restock for Recipes

When the user says something like "补全冰箱我要做博洛尼亚意大利面" or "restock fridge for Bolognese pasta", execute this multi-step workflow:

**Step 1: Authenticate with Picnic** (if not already done)

```bash
AUTH_TOKEN=$(curl -s -D - -o /dev/null \
  -H "Content-Type: application/json" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001" \
  -d '{"key": "picnic-22@hackaway.com", "password": "123456", "client_id": 30100}' \
  "https://storefront-prod.nl.picnicinternational.com/api/15/user/login" \
  | grep -i "x-picnic-auth" | awk '{ gsub(/,/, ""); print $2 }' | tr -d '\r\n')
echo -n "$AUTH_TOKEN" > /tmp/picnic-token
echo "Done! Token length: ${#AUTH_TOKEN}"
```

**Step 2: Read current fridge contents**

```bash
curl -s http://127.0.0.1:5173/api/home/state
```

Extract `fridgeItems` and `freezerItems` from the fridge device in `state.devices`.

**Step 3: Search for recipe on Picnic**

```bash
curl -s -X GET "https://storefront-prod.nl.picnicinternational.com/api/15/pages/hackathon-search-recipes?query=bolognese&limit=5" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001"
```

If a Picnic recipe is found, get its ingredient list via `hackathon-get-recipe`.
If not found, use knowledge of the recipe to build a general ingredient list.

**Step 4: Compare recipe ingredients vs fridge contents**

For each ingredient the recipe needs:
- Check if it already exists in `fridgeItems` or `freezerItems` (fuzzy name match)
- If it exists with enough quantity → skip
- If it exists but quantity is low → search Picnic for more
- If missing → search Picnic for it

**Step 5: Search and add missing items to Picnic cart**

For each missing ingredient:
```bash
# Search for the product
curl -s -X GET "https://storefront-prod.nl.picnicinternational.com/api/15/pages/hackathon-search-products?query=gehakt&limit=3" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001"

# Add first available result to cart
curl -s -X POST "https://storefront-prod.nl.picnicinternational.com/api/15/pages/task/hackathon-add-to-cart" \
  -H "Content-Type: application/json" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001" \
  -d '{"payload": {"selling_unit_id": "s1234567", "count": 1}}'
```

**Step 6: Update fridge inventory with incoming groceries**

After adding to cart, also update the fridge to reflect the expected incoming items:

```bash
curl -s -X POST http://127.0.0.1:5173/api/devices/fridge/items \
  -H "Content-Type: application/json" \
  -d '{"id": "device-fridge-kitchen", "action": "add", "compartment": "fridge", "item": {"name": "Ground Beef", "quantity": 1, "unit": "500g"}}'
```

**Step 7: Summarize to user**

Tell the user:
- What recipe was found
- Which ingredients were already in the fridge
- What was added to the Picnic cart (with prices if available)
- What was added to the fridge inventory
- Total estimated cost

### General Picnic Integration Patterns

The fridge inventory enables several Picnic integration workflows:

1. **Recipe restock** (above) — user names a dish, agent finds ingredients, compares fridge, orders missing items
2. **Weekly restock** — compare fridge against usual household staples, order what's running low
3. **Post-delivery update** — after Picnic delivery arrives, user says "update fridge", agent adds delivered items to inventory
4. **Expiry management** — check items that might expire soon, suggest recipes to use them up

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
