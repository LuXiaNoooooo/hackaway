import { lightModes } from "./homeData";

function getLightMode(modeKey) {
  return lightModes.find((mode) => mode.key === modeKey) ?? lightModes[0];
}

function getClimatePreset(simulationTime) {
  if (typeof simulationTime !== "number") {
    return "comfort";
  }

  const hour = simulationTime / 60;
  return hour >= 21 || hour < 7 ? "sleep" : "comfort";
}

export function buildOpenClawDeviceState(device, context = {}) {
  const environmentTemperature = context.environmentTemperature ?? null;
  const outdoorTemperature = context.outdoorTemperature ?? null;
  const simulationTime = context.simulationTime ?? null;

  if (device.type === "light") {
    const mode = getLightMode(device.lightMode);
    return {
      target: device.id,
      capability: "light",
      state: {
        power: device.isOn,
        mode: device.lightMode,
        kelvin: mode.kelvin,
        color: mode.color
      },
      commands: [
        {
          action: "set_light_power",
          method: "POST",
          path: "/api/devices/light/power",
          body: withDeviceId(device, { power: !device.isOn })
        },
        {
          action: "set_light_mode",
          method: "POST",
          path: "/api/devices/light/mode",
          body: withDeviceId(device, {
            mode: device.lightMode,
            kelvin: mode.kelvin
          })
        }
      ]
    };
  }

  if (device.type === "window") {
    return {
      target: device.id,
      capability: "window",
      state: {
        open: device.isOpen
      },
      commands: [
        {
          action: "set_window_open",
          method: "POST",
          path: "/api/devices/window/state",
          body: withDeviceId(device, { open: !device.isOpen })
        }
      ]
    };
  }

  if (device.type === "door") {
    return {
      target: device.id,
      capability: "door",
      state: {
        open: device.isOpen
      },
      commands: [
        {
          action: "set_door_open",
          method: "POST",
          path: "/api/devices/door/state",
          body: withDeviceId(device, { open: !device.isOpen })
        }
      ]
    };
  }

  if (device.type === "ac") {
    const preset = getClimatePreset(simulationTime);
    return {
      target: device.id,
      capability: "climate",
      state: {
        power: device.isOn,
        currentTemperature: environmentTemperature,
        outdoorTemperature,
        simulationTime,
        targetTemperature: device.temperature
      },
      commands: [
        {
          action: "set_climate_power",
          method: "POST",
          path: "/api/devices/climate/power",
          body: withDeviceId(device, { power: !device.isOn })
        },
        {
          action: "set_climate_temperature",
          method: "POST",
          path: "/api/devices/climate/temperature",
          body: withDeviceId(device, { targetTemperature: device.temperature })
        },
        {
          action: "set_climate_preset",
          method: "POST",
          path: "/api/devices/climate/preset",
          body: withDeviceId(device, { preset })
        }
      ]
    };
  }

  if (device.type === "tv") {
    return {
      target: device.id,
      capability: "tv",
      state: {
        power: device.isOn
      },
      commands: [
        {
          action: "set_tv_power",
          method: "POST",
          path: "/api/devices/tv/power",
          body: withDeviceId(device, { power: !device.isOn })
        }
      ]
    };
  }

  if (device.type === "fridge") {
    return {
      target: device.id,
      capability: "fridge",
      state: {
        doorOpen: device.isOpen,
        fridgeTemperature: device.fridgeTemperature,
        freezerTemperature: device.freezerTemperature,
        fridgeItems: device.fridgeItems ?? [],
        freezerItems: device.freezerItems ?? []
      },
      commands: [
        {
          action: "set_fridge_door",
          method: "POST",
          path: "/api/devices/fridge/door",
          body: withDeviceId(device, { open: !device.isOpen })
        },
        {
          action: "set_fridge_temperature",
          method: "POST",
          path: "/api/devices/fridge/temperature",
          body: withDeviceId(device, {
            fridgeTemperature: device.fridgeTemperature,
            freezerTemperature: device.freezerTemperature
          })
        },
        {
          action: "add_fridge_item",
          method: "POST",
          path: "/api/devices/fridge/items",
          body: withDeviceId(device, {
            action: "add",
            compartment: "fridge",
            item: { name: "ITEM_NAME", quantity: 1, unit: "pcs" }
          })
        },
        {
          action: "remove_fridge_item",
          method: "POST",
          path: "/api/devices/fridge/items",
          body: withDeviceId(device, {
            action: "remove",
            compartment: "fridge",
            itemName: "ITEM_NAME"
          })
        }
      ]
    };
  }

  return {
    target: device.id,
    capability: "robot",
    state: {
      status: device.status,
      loop: device.loopRoute,
      route: device.route ?? [],
      position: {
        x: Math.round(device.x),
        y: Math.round(device.y)
      }
    },
    commands: [
      {
        action: "set_robot_route",
        method: "POST",
        path: "/api/devices/robot/route",
        body: withDeviceId(device, {
          loop: device.loopRoute,
          route: device.route ?? []
        })
      },
      {
        action: "set_robot_motion",
        method: "POST",
        path: "/api/devices/robot/motion",
        body: withDeviceId(device, {
          status: device.status === "running" ? "paused" : "running"
        })
      },
      {
        action: "clean_current_room",
        method: "POST",
        path: "/api/devices/robot/clean",
        body: withDeviceId(device, {
          roomId: device.roomId,
          loop: false
        })
      },
      {
        action: "clean_home",
        method: "POST",
        path: "/api/devices/robot/clean",
        body: withDeviceId(device, {
          scope: "home",
          loop: false
        })
      }
    ]
  };
}

function withDeviceId(device, payload) {
  return {
    id: device.id,
    ...payload
  };
}
