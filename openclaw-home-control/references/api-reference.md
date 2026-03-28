# API Reference

Base URL:
- api url: `http://10.37.129.2:5173`
- Adjust the host and port to match the running console

All write operations are `POST`.
All successful write operations return the latest full `state`.

## Read APIs

### `GET /api/health`

Purpose:
- Service liveness check

Response:
```json
{
  "status": "ok",
  "service": "hackaway-home-console",
  "timestamp": "2026-03-28T12:28:29.637Z"
}
```

### `GET /api/home/state`

Purpose:
- Read the current rooms, devices, time, and temperatures

Response shape:
```json
{
  "status": "ok",
  "state": {
    "rooms": [
      {
        "id": "room-living",
        "kind": "living",
        "name": "Living Room",
        "x": 140,
        "y": 140,
        "width": 320,
        "height": 220
      }
    ],
    "devices": [
      {
        "id": "device-light-main",
        "type": "light",
        "roomId": "room-living"
      }
    ],
    "simulationTimeMinutes": 540,
    "environmentTemperature": 23.6,
    "outdoorTemperature": 22.7
  }
}
```

### `GET /api/devices`

Purpose:
- Read a compact device catalog

Response:
```json
{
  "status": "ok",
  "devices": [
    {
      "id": "device-light-main",
      "type": "light",
      "name": "Main Pendant"
    }
  ]
}
```

### `GET /api/devices/:id`

Purpose:
- Inspect one specific device

Example:
```http
GET /api/devices/device-light-main
```

## Write APIs

### `POST /api/simulation/time`

Purpose:
- Adjust simulated time

Body:
```json
{
  "minutes": 1320
}
```

Notes:
- Minutes are normalized into the 0-1439 range

### Light

#### `POST /api/devices/light/power`

Body:
```json
{
  "all": true,
  "power": false
}
```

Or:
```json
{
  "roomId": "room-bedroom",
  "power": true
}
```

#### `POST /api/devices/light/mode`

Body:
```json
{
  "roomId": "room-bedroom",
  "mode": "night"
}
```

Modes:
- `cozy`
- `focus`
- `daylight`
- `night`

Behavior:
- Applying a mode also turns matched lights on

### Window

#### `POST /api/devices/window/state`

Body:
```json
{
  "all": true,
  "open": false
}
```

### Door

#### `POST /api/devices/door/state`

Body:
```json
{
  "all": true,
  "open": false
}
```

### TV

#### `POST /api/devices/tv/power`

Body:
```json
{
  "roomId": "room-living",
  "power": true
}
```

### Climate

#### `POST /api/devices/climate/power`

Body:
```json
{
  "all": true,
  "power": false
}
```

#### `POST /api/devices/climate/temperature`

Body:
```json
{
  "roomId": "room-bedroom",
  "targetTemperature": 21
}
```

Notes:
- Temperature is clamped to `16-30`
- Setting a target temperature turns the unit on

#### `POST /api/devices/climate/preset`

Body:
```json
{
  "roomId": "room-bedroom",
  "preset": "sleep"
}
```

Supported presets:
- `sleep`
- `comfort`
- `away`

Behavior:
- `sleep` sets the matched AC to a sleep-friendly temperature and powers it on
- `comfort` sets the matched AC to a general comfort temperature and powers it on
- `away` sets an away temperature and defaults to off unless `"power": true` is included

Away example with unit still running:
```json
{
  "all": true,
  "preset": "away",
  "power": true
}
```

### Fridge

#### `POST /api/devices/fridge/door`

Body:
```json
{
  "id": "device-fridge-kitchen",
  "open": true
}
```

#### `POST /api/devices/fridge/temperature`

Body:
```json
{
  "id": "device-fridge-kitchen",
  "fridgeTemperature": 3,
  "freezerTemperature": -20
}
```

Notes:
- Fridge temperature is clamped to `1-8`
- Freezer temperature is clamped to `-25` to `-10`
- Both fields are optional; omit a field to leave it unchanged

#### `POST /api/devices/fridge/items`

Purpose:
- Manage fridge or freezer inventory

Add an item:
```json
{
  "id": "device-fridge-kitchen",
  "action": "add",
  "compartment": "fridge",
  "item": {
    "name": "Whole Milk",
    "quantity": 1,
    "unit": "L"
  }
}
```

Remove an item:
```json
{
  "id": "device-fridge-kitchen",
  "action": "remove",
  "compartment": "fridge",
  "itemName": "Whole Milk",
  "quantity": 1
}
```

Clear a compartment:
```json
{
  "id": "device-fridge-kitchen",
  "action": "clear",
  "compartment": "freezer"
}
```

Replace all items in a compartment:
```json
{
  "id": "device-fridge-kitchen",
  "action": "set",
  "compartment": "fridge",
  "items": [
    { "name": "Milk", "quantity": 2, "unit": "L" },
    { "name": "Eggs", "quantity": 12, "unit": "pcs" }
  ]
}
```

Notes:
- `compartment` can be `"fridge"` or `"freezer"` (defaults to `"fridge"`)
- When adding, if an item with the same name already exists, the quantity is increased
- When removing without specifying quantity, the entire item is removed
- `unit` is freeform text (e.g., `"L"`, `"pcs"`, `"pack"`, `"kg"`, `"bag"`)

### Robot

#### `POST /api/devices/robot/motion`

Body:
```json
{
  "all": true,
  "status": "idle"
}
```

Allowed statuses:
- `running`
- `paused`
- `idle`

#### `POST /api/devices/robot/route`

Body:
```json
{
  "id": "device-robot",
  "route": [
    { "x": 250, "y": 312 },
    { "x": 370, "y": 312 }
  ],
  "loop": false
}
```

Use this only when you really need custom geometry.

#### `POST /api/devices/robot/clean`

Purpose:
- Generate a room-aware cleaning path automatically

Select the robot with:
- `id`
- `ids`
- `all`

Select cleaning scope with:
- `roomId`
- `roomIds`
- `scope: "home"`

Examples:

Clean the kitchen:
```json
{
  "id": "device-robot",
  "roomId": "room-kitchen",
  "loop": false
}
```

Clean the whole home:
```json
{
  "id": "device-robot",
  "scope": "home",
  "loop": false
}
```

Behavior:
- The server builds the route
- The robot status becomes `running` when a route is produced
- No manual geometry planning is required

## Batch API

### `POST /api/actions/batch`

Purpose:
- Execute an ordered action chain in one request

Body:
```json
{
  "continueOnError": false,
  "actions": [
    {
      "path": "/api/devices/light/power",
      "body": {
        "all": true,
        "power": false
      }
    },
    {
      "path": "/api/devices/light/mode",
      "optional": true,
      "body": {
        "roomId": "room-bedroom",
        "mode": "night"
      }
    }
  ]
}
```

Per-action fields:
- `path`: required
- `method`: optional, defaults to `POST`, must be `POST`
- `body`: optional object
- `optional`: optional boolean. If true, a failure becomes `skipped` and the batch continues.

Response on success:
```json
{
  "status": "ok",
  "results": [
    {
      "index": 0,
      "path": "/api/devices/light/power",
      "status": "ok",
      "affectedDeviceIds": ["device-light-main"],
      "message": "Executed light/power"
    }
  ],
  "state": {
    "rooms": [],
    "devices": []
  }
}
```

Response on partial success:
```json
{
  "status": "partial",
  "results": [
    {
      "index": 0,
      "path": "/api/devices/light/power",
      "status": "ok"
    },
    {
      "index": 1,
      "path": "/api/devices/light/mode",
      "status": "skipped",
      "statusCode": 404,
      "message": "No light devices matched the target selection"
    }
  ],
  "state": {
    "rooms": [],
    "devices": []
  }
}
```

Response when stopped on error:
```json
{
  "status": "error",
  "message": "Batch stopped at action 1",
  "failedAction": {
    "index": 1,
    "path": "/api/devices/light/mode",
    "status": "error",
    "statusCode": 404,
    "message": "No light devices matched the target selection"
  },
  "results": [
    {
      "index": 0,
      "path": "/api/devices/light/power",
      "status": "ok"
    },
    {
      "index": 1,
      "path": "/api/devices/light/mode",
      "status": "error"
    }
  ],
  "state": {
    "rooms": [],
    "devices": []
  }
}
```

Important:
- Batch is ordered
- Batch is not atomic
- Prefer `optional: true` for “best effort” actions

## Legacy Routes

Do not use these:
- `POST /api/devices/:id/light/power`
- `POST /api/devices/:id/window/state`
- Any other `POST /api/devices/:id/...` write route

They have been removed and return `404`.
