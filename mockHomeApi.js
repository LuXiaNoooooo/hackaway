import { initialDevices, initialRooms, lightModes } from "./src/homeData.js";

const robotSpeed = 110;
const initialSimulationTimeMinutes = 9 * 60;
const capabilityDeviceTypes = {
  light: "light",
  window: "window",
  door: "door",
  climate: "ac",
  tv: "tv",
  robot: "robot"
};
const climatePresets = {
  sleep: 21,
  comfort: 23,
  away: 27
};

export function createHomeApiMiddleware() {
  const state = createInitialServerState();

  return async function homeApiMiddleware(req, res, next) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (!pathname.startsWith("/api/")) {
      next();
      return;
    }

    setApiHeaders(res);

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    tickServerState(state);

    if (pathname === "/api/health") {
      if (!["GET", "POST"].includes(req.method ?? "GET")) {
        sendJson(res, 405, { status: "error", message: "Method not allowed" });
        return;
      }

      sendJson(res, 200, {
        status: "ok",
        service: "hackaway-home-console",
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (pathname === "/api/home/state") {
      if (req.method === "GET") {
        sendJson(res, 200, {
          status: "ok",
          state: serializeState(state)
        });
        return;
      }

      if (req.method === "POST") {
        const body = await readJsonBody(req);
        if (Array.isArray(body.rooms)) {
          state.rooms = clone(body.rooms);
        }
        if (Array.isArray(body.devices)) {
          state.devices = clone(body.devices);
        }

        sendJson(res, 200, {
          status: "ok",
          state: serializeState(state)
        });
        return;
      }
    }

    if (pathname === "/api/actions/batch" && req.method === "POST") {
      const body = await readJsonBody(req);
      const batchResult = executeBatchActions(state, body);
      sendJson(res, batchResult.statusCode, batchResult.payload);
      return;
    }

    if (pathname === "/api/simulation/time" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = executeMutableAction(state, pathname, body);
      sendJson(res, result.statusCode, result.payload);
      return;
    }

    if (pathname === "/api/devices" && req.method === "GET") {
      sendJson(res, 200, {
        status: "ok",
        devices: state.devices.map((device) => ({
          id: device.id,
          type: device.type,
          name: device.name
        }))
      });
      return;
    }

    if (matchDeviceCommandPath(pathname) && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = executeMutableAction(state, pathname, body);
      sendJson(res, result.statusCode, result.payload);
      return;
    }

    const deviceMatch = pathname.match(/^\/api\/devices\/([^/]+)$/);
    if (!deviceMatch) {
      sendJson(res, 404, { status: "error", message: "API route not found" });
      return;
    }

    const [, encodedDeviceId] = deviceMatch;
    const deviceId = decodeURIComponent(encodedDeviceId);
    const device = state.devices.find((item) => item.id === deviceId);

    if (!device) {
      sendJson(res, 404, { status: "error", message: `Device ${deviceId} not found` });
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, {
        status: "ok",
        device
      });
      return;
    }

    sendJson(res, 405, { status: "error", message: "Method not allowed" });
  };
}

function createInitialServerState() {
  return {
    rooms: clone(initialRooms),
    devices: clone(initialDevices),
    simulationTimeMinutes: initialSimulationTimeMinutes,
    environmentTemperature: 23.6,
    outdoorTemperature: computeOutdoorTemperature(initialSimulationTimeMinutes),
    lastTickAt: Date.now()
  };
}

function executeBatchActions(state, body) {
  const actions = Array.isArray(body.actions) ? body.actions : null;
  if (!actions || actions.length === 0) {
    return {
      statusCode: 400,
      payload: {
        status: "error",
        message: "Batch requires a non-empty actions array"
      }
    };
  }

  const continueOnError = body.continueOnError === true;
  const results = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] ?? {};
    const path = normalizeActionPath(action.path);
    const method = typeof action.method === "string" ? action.method.toUpperCase() : "POST";
    const isOptional = action.optional === true;

    if (!path) {
      const failed = buildBatchFailure(index, path, 400, "Action path is required", isOptional);
      results.push(failed);
      if (!isOptional && !continueOnError) {
        return buildBatchStopResponse(results, failed, state);
      }
      continue;
    }

    if (method !== "POST") {
      const failed = buildBatchFailure(index, path, 405, "Batch only supports POST actions", isOptional);
      results.push(failed);
      if (!isOptional && !continueOnError) {
        return buildBatchStopResponse(results, failed, state);
      }
      continue;
    }

    const execution = executeMutableAction(state, path, action.body ?? {});
    if (!execution.ok) {
      const failed = buildBatchFailure(
        index,
        path,
        execution.statusCode,
        execution.payload.message ?? "Action failed",
        isOptional
      );
      results.push(failed);
      if (!isOptional && !continueOnError) {
        return buildBatchStopResponse(results, failed, state);
      }
      continue;
    }

    results.push({
      index,
      path,
      status: "ok",
      affectedDeviceIds: execution.affectedDeviceIds ?? [],
      message: execution.message ?? null
    });
  }

  const status = results.some((result) => result.status === "error") ? "partial" : "ok";
  return {
    statusCode: 200,
    payload: {
      status,
      results,
      state: serializeState(state)
    }
  };
}

function buildBatchStopResponse(results, failedAction, state) {
  return {
    statusCode: failedAction.statusCode,
    payload: {
      status: "error",
      message: `Batch stopped at action ${failedAction.index}`,
      failedAction,
      results,
      state: serializeState(state)
    }
  };
}

function buildBatchFailure(index, path, statusCode, message, optional) {
  return {
    index,
    path,
    status: optional ? "skipped" : "error",
    statusCode,
    message
  };
}

function normalizeActionPath(path) {
  if (typeof path !== "string") {
    return "";
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function executeMutableAction(state, pathname, body) {
  if (pathname === "/api/simulation/time") {
    const minutes = normalizeTimeMinutes(body.minutes ?? state.simulationTimeMinutes);
    state.simulationTimeMinutes = minutes;
    state.outdoorTemperature = computeOutdoorTemperature(minutes);

    return {
      ok: true,
      statusCode: 200,
      payload: {
        status: "ok",
        state: serializeState(state)
      },
      message: `Simulation time set to ${minutes}`
    };
  }

  const command = matchDeviceCommandPath(pathname);
  if (!command) {
    return {
      ok: false,
      statusCode: 404,
      payload: {
        status: "error",
        message: "API route not found"
      }
    };
  }

  const selection = resolveTargetDevices(state.devices, command.capability, body);
  if (selection.error) {
    return {
      ok: false,
      statusCode: 400,
      payload: {
        status: "error",
        message: selection.error
      }
    };
  }

  if (selection.devices.length === 0) {
    return {
      ok: false,
      statusCode: 404,
      payload: {
        status: "error",
        message: `No ${command.capability} devices matched the target selection`
      }
    };
  }

  const updated = applyDeviceCommand(selection.devices, command.suffix, body, state);
  if (!updated) {
    return {
      ok: false,
      statusCode: 404,
      payload: {
        status: "error",
        message: `Unsupported route ${pathname}`
      }
    };
  }

  const payload = {
    status: "ok",
    devices: updated,
    state: serializeState(state)
  };

  if (updated.length === 1) {
    payload.device = updated[0];
  }

  return {
    ok: true,
    statusCode: 200,
    payload,
    affectedDeviceIds: updated.map((device) => device.id),
    message: `Executed ${command.suffix}`
  };
}

function applyDeviceCommand(devices, suffix, body, state) {
  if (suffix === "light/power") {
    for (const device of devices) {
      device.isOn = Boolean(body.power);
    }
    return devices;
  }

  if (suffix === "light/mode") {
    const fallbackMode = lightModes[0];
    const nextMode =
      lightModes.find((mode) => mode.key === body.mode) ??
      fallbackMode;

    for (const device of devices) {
      device.isOn = true;
      device.lightMode = nextMode.key;
    }

    return devices;
  }

  if (suffix === "window/state") {
    for (const device of devices) {
      device.isOpen = Boolean(body.open);
    }
    return devices;
  }

  if (suffix === "door/state") {
    for (const device of devices) {
      device.isOpen = Boolean(body.open);
    }
    return devices;
  }

  if (suffix === "climate/power") {
    for (const device of devices) {
      device.isOn = Boolean(body.power);
    }
    return devices;
  }

  if (suffix === "climate/temperature") {
    const targetTemperature = clampTemperature(body.targetTemperature);

    for (const device of devices) {
      device.isOn = true;
      device.temperature = targetTemperature;
    }

    return devices;
  }

  if (suffix === "climate/preset") {
    const presetTemperature = resolveClimatePresetTemperature(body.preset);
    if (presetTemperature == null) {
      return null;
    }

    for (const device of devices) {
      device.isOn = body.preset === "away" ? Boolean(body.power) : true;
      device.temperature = presetTemperature;
    }

    return devices;
  }

  if (suffix === "tv/power") {
    for (const device of devices) {
      device.isOn = Boolean(body.power);
    }
    return devices;
  }

  if (suffix === "robot/route") {
    const route = normalizeRoute(body.route);

    for (const device of devices) {
      device.route = route;
      device.loopRoute = typeof body.loop === "boolean" ? body.loop : device.loopRoute;
      device.routeIndex = 0;

      if (device.route.length === 0) {
        device.status = "idle";
      }
    }

    return devices;
  }

  if (suffix === "robot/motion") {
    const nextStatus = body.status;

    for (const device of devices) {
      if (["running", "paused", "idle"].includes(nextStatus)) {
        device.status = nextStatus;
      }
      if (device.status === "running" && !device.route?.length) {
        device.status = "idle";
      }
    }

    return devices;
  }

  if (suffix === "robot/clean") {
    const rooms = resolveCleaningRooms(state.rooms, body, devices[0]?.roomId ?? null);
    const route = buildCleaningRoute(rooms);

    for (const device of devices) {
      device.route = route;
      device.loopRoute = typeof body.loop === "boolean" ? body.loop : false;
      device.routeIndex = 0;
      device.status = route.length > 0 ? "running" : "idle";
      syncRobotRoomId(state.rooms, device);
    }

    return devices;
  }

  return null;
}

function matchDeviceCommandPath(pathname) {
  const match = pathname.match(/^\/api\/devices\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const [, capability, action] = match;
  return {
    capability: decodeURIComponent(capability),
    suffix: `${decodeURIComponent(capability)}/${decodeURIComponent(action)}`
  };
}

function resolveTargetDevices(devices, capability, body) {
  const expectedType = capabilityDeviceTypes[capability];
  if (!expectedType) {
    return {
      devices: [],
      error: `Unsupported capability ${capability}`
    };
  }

  const candidates = devices.filter((device) => device.type === expectedType);
  let selected = candidates;
  let hasSelector = false;

  if (body.all === true) {
    hasSelector = true;
  }

  if (typeof body.id === "string" && body.id.trim()) {
    hasSelector = true;
    selected = selected.filter((device) => device.id === body.id.trim());
  }

  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((value) => typeof value === "string" && value.trim());
    if (ids.length > 0) {
      hasSelector = true;
      selected = selected.filter((device) => ids.includes(device.id));
    }
  }

  if (capability !== "robot" && typeof body.roomId === "string" && body.roomId.trim()) {
    hasSelector = true;
    selected = selected.filter((device) => device.roomId === body.roomId.trim());
  }

  if (capability !== "robot" && Array.isArray(body.roomIds)) {
    const roomIds = body.roomIds.filter((value) => typeof value === "string" && value.trim());
    if (roomIds.length > 0) {
      hasSelector = true;
      selected = selected.filter((device) => roomIds.includes(device.roomId));
    }
  }

  if (Array.isArray(body.excludeRoomIds)) {
    const excludedRoomIds = body.excludeRoomIds.filter((value) => typeof value === "string" && value.trim());
    if (excludedRoomIds.length > 0) {
      selected = selected.filter((device) => !excludedRoomIds.includes(device.roomId));
    }
  }

  if (!hasSelector) {
    return {
      devices: [],
      error: "Target selection is required. Use id, ids, roomId, roomIds, or all."
    };
  }

  return {
    devices: selected,
    error: null
  };
}

function normalizeRoute(route) {
  if (!Array.isArray(route)) {
    return [];
  }

  return route
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => ({
      x: Number(point.x),
      y: Number(point.y)
    }));
}

function resolveClimatePresetTemperature(preset) {
  if (typeof preset !== "string") {
    return null;
  }

  return climatePresets[preset] ?? null;
}

function resolveCleaningRooms(rooms, body, fallbackRoomId) {
  if (body.scope === "home") {
    return rooms;
  }

  if (typeof body.roomId === "string" && body.roomId.trim()) {
    return rooms.filter((room) => room.id === body.roomId.trim());
  }

  if (Array.isArray(body.roomIds)) {
    const roomIds = body.roomIds.filter((value) => typeof value === "string" && value.trim());
    if (roomIds.length > 0) {
      return rooms.filter((room) => roomIds.includes(room.id));
    }
  }

  if (fallbackRoomId) {
    return rooms.filter((room) => room.id === fallbackRoomId);
  }

  return [];
}

function buildCleaningRoute(rooms) {
  const orderedRooms = [...rooms].sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    return left.x - right.x;
  });
  const route = [];

  for (const room of orderedRooms) {
    const insetX = Math.min(28, room.width / 4);
    const insetY = Math.min(28, room.height / 4);
    const left = Math.round(room.x + insetX);
    const right = Math.round(room.x + room.width - insetX);
    const top = Math.round(room.y + insetY);
    const bottom = Math.round(room.y + room.height - insetY);

    if (right <= left || bottom <= top) {
      continue;
    }

    const laneStep = Math.max(52, Math.min(72, Math.round(room.width / 3)));
    let forward = true;

    for (let y = top; y <= bottom; y += laneStep) {
      if (forward) {
        route.push({ x: left, y });
        route.push({ x: right, y });
      } else {
        route.push({ x: right, y });
        route.push({ x: left, y });
      }
      forward = !forward;
    }

    const finalY = route.at(-1)?.y;
    if (finalY !== bottom) {
      if (forward) {
        route.push({ x: right, y: bottom });
        route.push({ x: left, y: bottom });
      } else {
        route.push({ x: left, y: bottom });
        route.push({ x: right, y: bottom });
      }
    }
  }

  return route;
}

function syncRobotRoomId(rooms, robot) {
  const containingRoom = rooms.find((room) => isPointInsideRoom(robot, room));
  if (containingRoom) {
    robot.roomId = containingRoom.id;
  }
}

function isPointInsideRoom(point, room) {
  return (
    point.x >= room.x &&
    point.x <= room.x + room.width &&
    point.y >= room.y &&
    point.y <= room.y + room.height
  );
}

function tickServerState(state) {
  const now = Date.now();
  const deltaMs = Math.max(0, now - state.lastTickAt);
  state.lastTickAt = now;

  if (deltaMs === 0) {
    return;
  }

  state.simulationTimeMinutes = normalizeTimeMinutes(state.simulationTimeMinutes + deltaMs / 60000);
  state.outdoorTemperature = computeOutdoorTemperature(state.simulationTimeMinutes);
  state.environmentTemperature = computeEnvironmentTemperature(state, deltaMs);
  tickRobot(state.rooms, state.devices, deltaMs);
}

function tickRobot(rooms, devices, deltaMs) {
  const robot = devices.find((device) => device.type === "robot");
  if (!robot || robot.status !== "running" || !robot.route?.length) {
    return;
  }

  const target = robot.route[robot.routeIndex] ?? null;
  if (!target) {
    robot.status = "idle";
    robot.routeIndex = 0;
    return;
  }

  const dx = target.x - robot.x;
  const dy = target.y - robot.y;
  const distance = Math.hypot(dx, dy);
  const step = (deltaMs / 1000) * robotSpeed;

  if (distance <= step) {
    robot.x = target.x;
    robot.y = target.y;
    syncRobotRoomId(rooms, robot);
    const reachedIndex = robot.routeIndex + 1;

    if (reachedIndex < robot.route.length) {
      robot.routeIndex = reachedIndex;
      return;
    }

    if (robot.loopRoute) {
      robot.routeIndex = 0;
      return;
    }

    robot.status = "idle";
    robot.routeIndex = Math.max(0, robot.route.length - 1);
    return;
  }

  robot.x += (dx / distance) * step;
  robot.y += (dy / distance) * step;
  syncRobotRoomId(rooms, robot);
}

function computeEnvironmentTemperature(state, deltaMs) {
  const seconds = deltaMs / 1000;
  const activeAcs = state.devices.filter((device) => device.type === "ac" && device.isOn);
  const openWindows = state.devices.filter((device) => device.type === "window" && device.isOpen);

  let next = state.environmentTemperature;
  const ambientStrength = Math.min(0.04, 0.012 * seconds);
  next += (state.outdoorTemperature - next) * ambientStrength;

  if (activeAcs.length > 0) {
    const averageTarget = activeAcs.reduce((sum, device) => sum + device.temperature, 0) / activeAcs.length;
    const acStrength = Math.min(0.22, activeAcs.length * 0.12 * seconds);
    next += (averageTarget - next) * acStrength;
  }

  if (openWindows.length > 0) {
    const windowStrength = Math.min(0.12, openWindows.length * 0.045 * seconds);
    next += (state.outdoorTemperature - next) * windowStrength;
  }

  return roundTemperature(next);
}

function serializeState(state) {
  return {
    rooms: clone(state.rooms),
    devices: clone(state.devices),
    simulationTimeMinutes: state.simulationTimeMinutes,
    environmentTemperature: state.environmentTemperature,
    outdoorTemperature: state.outdoorTemperature
  };
}

function computeOutdoorTemperature(simulationTimeMinutes) {
  const peakAtMinutes = 14 * 60;
  const mean = 21;
  const amplitude = 6.5;
  const angle = ((simulationTimeMinutes - peakAtMinutes) / 1440) * 2 * Math.PI;
  return roundTemperature(mean + Math.cos(angle) * amplitude);
}

function normalizeTimeMinutes(minutes) {
  const numericMinutes = Number.isFinite(minutes) ? minutes : Number(minutes) || 0;
  return ((numericMinutes % 1440) + 1440) % 1440;
}

function clampTemperature(value) {
  const numeric = Number(value);
  return Math.max(16, Math.min(30, Math.round(Number.isFinite(numeric) ? numeric : 24)));
}

function roundTemperature(value) {
  return Math.round(value * 10) / 10;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setApiHeaders(res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}
