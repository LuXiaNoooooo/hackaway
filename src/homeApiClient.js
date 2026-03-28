export async function fetchHomeState() {
  const response = await requestJson("/api/home/state");
  return response.state;
}

export async function postSimulationTime(minutes) {
  const response = await requestJson("/api/simulation/time", {
    method: "POST",
    body: { minutes }
  });
  return response.state;
}

export async function pushHomeDocument(documentState) {
  const response = await requestJson("/api/home/state", {
    method: "POST",
    body: {
      rooms: documentState.rooms,
      devices: documentState.devices
    }
  });
  return response.state;
}

export async function sendDeviceCommand(device, command) {
  const requests = buildDeviceRequests(device, command);
  let latestState = null;

  for (const request of requests) {
    const response = await requestJson(request.path, {
      method: "POST",
      body: request.body
    });
    latestState = response.state ?? latestState;
  }

  return latestState;
}

function buildDeviceRequests(device, command) {
  if (command.type === "toggle-light-power") {
    return [
      {
        path: "/api/devices/light/power",
        body: withDeviceId(device, { power: !device.isOn })
      }
    ];
  }

  if (command.type === "set-light-mode") {
    return [
      {
        path: "/api/devices/light/mode",
        body: withDeviceId(device, { mode: command.mode })
      }
    ];
  }

  if (command.type === "toggle-window") {
    return [
      {
        path: "/api/devices/window/state",
        body: withDeviceId(device, { open: !device.isOpen })
      }
    ];
  }

  if (command.type === "toggle-door") {
    return [
      {
        path: "/api/devices/door/state",
        body: withDeviceId(device, { open: !device.isOpen })
      }
    ];
  }

  if (command.type === "toggle-ac-power") {
    return [
      {
        path: "/api/devices/climate/power",
        body: withDeviceId(device, { power: !device.isOn })
      }
    ];
  }

  if (command.type === "set-ac-temperature") {
    return [
      {
        path: "/api/devices/climate/temperature",
        body: withDeviceId(device, { targetTemperature: command.temperature })
      }
    ];
  }

  if (command.type === "toggle-tv") {
    return [
      {
        path: "/api/devices/tv/power",
        body: withDeviceId(device, { power: !device.isOn })
      }
    ];
  }

  if (command.type === "toggle-fridge-door") {
    return [
      {
        path: "/api/devices/fridge/door",
        body: withDeviceId(device, { open: !device.isOpen })
      }
    ];
  }

  if (command.type === "set-fridge-temperature") {
    const payload = {};
    if (command.fridgeTemperature != null) payload.fridgeTemperature = command.fridgeTemperature;
    if (command.freezerTemperature != null) payload.freezerTemperature = command.freezerTemperature;
    return [
      {
        path: "/api/devices/fridge/temperature",
        body: withDeviceId(device, payload)
      }
    ];
  }

  if (command.type === "fridge-add-item") {
    return [
      {
        path: "/api/devices/fridge/items",
        body: withDeviceId(device, {
          action: "add",
          compartment: command.compartment ?? "fridge",
          item: command.item
        })
      }
    ];
  }

  if (command.type === "fridge-remove-item") {
    return [
      {
        path: "/api/devices/fridge/items",
        body: withDeviceId(device, {
          action: "remove",
          compartment: command.compartment ?? "fridge",
          itemName: command.itemName,
          quantity: command.quantity
        })
      }
    ];
  }

  if (command.type === "clear-robot-route") {
    return [
      {
        path: "/api/devices/robot/route",
        body: withDeviceId(device, { route: [], loop: device.loopRoute })
      }
    ];
  }

  if (command.type === "toggle-robot-loop") {
    return [
      {
        path: "/api/devices/robot/route",
        body: withDeviceId(device, {
          route: device.route ?? [],
          loop: !device.loopRoute
        })
      }
    ];
  }

  if (command.type === "start-robot") {
    return [
      {
        path: "/api/devices/robot/route",
        body: withDeviceId(device, {
          route: device.route ?? [],
          loop: device.loopRoute
        })
      },
      {
        path: "/api/devices/robot/motion",
        body: withDeviceId(device, { status: "running" })
      }
    ];
  }

  if (command.type === "pause-robot") {
    return [
      {
        path: "/api/devices/robot/motion",
        body: withDeviceId(device, {
          status: device.status === "running" ? "paused" : "running"
        })
      }
    ];
  }

  return [];
}

function withDeviceId(device, payload) {
  return {
    id: device.id,
    ...payload
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = payload.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
