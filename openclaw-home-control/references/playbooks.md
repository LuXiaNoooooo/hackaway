# Playbooks

These playbooks assume you first call `GET /api/home/state` and inspect the actual room and device ids.

Do not hardcode demo ids in production logic. Use them only as examples after discovery.

## Playbook: “I just cooked and I’m going to rest.”

Intent:
- Clean the kitchen
- Turn off all lights
- Keep only the bedroom in night mode
- Close all windows
- Set bedroom climate to sleep comfort

Recommended batch:
```json
{
  "continueOnError": false,
  "actions": [
    {
      "path": "/api/devices/robot/clean",
      "body": {
        "id": "device-robot",
        "roomId": "room-kitchen",
        "loop": false
      }
    },
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
    },
    {
      "path": "/api/devices/window/state",
      "body": {
        "all": true,
        "open": false
      }
    },
    {
      "path": "/api/devices/climate/preset",
      "optional": true,
      "body": {
        "roomId": "room-bedroom",
        "preset": "sleep"
      }
    }
  ]
}
```

Why this works:
- `robot/clean` avoids geometry planning
- `light/mode` powers bedroom lights back on in night mode
- Optional climate and bedroom-light steps avoid breaking the whole routine if the room lacks those devices

## Playbook: “I’m leaving home.”

Intent:
- Turn off all powered devices
- Close doors and windows
- Run whole-home cleaning

Recommended batch:
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
      "path": "/api/devices/tv/power",
      "optional": true,
      "body": {
        "all": true,
        "power": false
      }
    },
    {
      "path": "/api/devices/climate/power",
      "optional": true,
      "body": {
        "all": true,
        "power": false
      }
    },
    {
      "path": "/api/devices/window/state",
      "body": {
        "all": true,
        "open": false
      }
    },
    {
      "path": "/api/devices/door/state",
      "body": {
        "all": true,
        "open": false
      }
    },
    {
      "path": "/api/devices/robot/clean",
      "body": {
        "id": "device-robot",
        "scope": "home",
        "loop": false
      }
    }
  ]
}
```

Optional variation:
- If the home should be fully shut down and no cleaning should run, replace the last step with:
```json
{
  "path": "/api/devices/robot/motion",
  "body": {
    "all": true,
    "status": "idle"
  }
}
```

## Playbook: “I’m going to watch TV.”

Intent:
- Find the room containing the active or target TV
- Turn off lights elsewhere
- Set the TV room lights to cozy
- Set climate to comfort
- Stop the robot

Discovery step:
1. Read `GET /api/home/state`
2. Find the target TV device in `state.devices`
3. Read its `roomId`

Recommended batch after discovery:
```json
{
  "continueOnError": false,
  "actions": [
    {
      "path": "/api/devices/robot/motion",
      "body": {
        "all": true,
        "status": "idle"
      }
    },
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
        "roomId": "room-living",
        "mode": "cozy"
      }
    },
    {
      "path": "/api/devices/tv/power",
      "optional": true,
      "body": {
        "roomId": "room-living",
        "power": true
      }
    },
    {
      "path": "/api/devices/climate/preset",
      "optional": true,
      "body": {
        "all": true,
        "preset": "comfort"
      }
    }
  ]
}
```

Refinement:
- If only the TV room should stay lit and other rooms must remain dark, the two light actions above are enough
- If the user specifies a temperature number, replace the climate preset action with `POST /api/devices/climate/temperature`

## Planning Heuristics

When translating user language to actions:
- “Rest”, “sleep”, “night” -> use `light/mode = night` and `climate/preset = sleep`
- “Comfortable”, “watch TV”, “relax” -> use `light/mode = cozy` and `climate/preset = comfort`
- “Leave home”, “away”, “going out” -> prefer powered devices off, windows closed, doors closed, optional `climate/preset = away`

## Failure Handling

Prefer this order:
1. Read current state
2. Use `optional: true` where hardware may be absent
3. Use `continueOnError: false` unless the task is explicitly best-effort
4. Inspect the final `state` returned by the batch before telling the user what happened
