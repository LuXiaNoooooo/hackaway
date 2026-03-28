import { planConfig, roomTemplates } from "./homeData";

export const minimumRoomSize = 120;
const edgeSnapThreshold = 20;

export function snapToGrid(value) {
  return Math.round(value / planConfig.grid) * planConfig.grid;
}

export function clampPoint(point) {
  return {
    x: clamp(point.x, 0, planConfig.width),
    y: clamp(point.y, 0, planConfig.height)
  };
}

export function normalizeDraftRect(start, current) {
  const a = clampPoint(start);
  const b = clampPoint(current);

  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.max(minimumRoomSize, Math.abs(a.x - b.x)),
    height: Math.max(minimumRoomSize, Math.abs(a.y - b.y))
  };
}

export function finalizeRoomRect(rect, rooms, ignoreRoomId = null) {
  const gridRect = clampRoomRect({
    x: snapToGrid(rect.x),
    y: snapToGrid(rect.y),
    width: Math.max(minimumRoomSize, snapToGrid(rect.width)),
    height: Math.max(minimumRoomSize, snapToGrid(rect.height))
  });

  return snapRectToNeighbors(gridRect, rooms, ignoreRoomId);
}

export function clampRoomRect(rect) {
  return {
    ...rect,
    x: clamp(rect.x, 0, planConfig.width - rect.width),
    y: clamp(rect.y, 0, planConfig.height - rect.height)
  };
}

export function pointInRoom(point, room) {
  return (
    point.x >= room.x &&
    point.x <= room.x + room.width &&
    point.y >= room.y &&
    point.y <= room.y + room.height
  );
}

export function findRoomAtPoint(rooms, point) {
  return [...rooms].reverse().find((room) => pointInRoom(point, room)) ?? null;
}

export function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    a.x >= b.x + b.width ||
    a.y + a.height <= b.y ||
    a.y >= b.y + b.height
  );
}

export function wouldOverlap(rect, rooms, ignoreRoomId = null) {
  return rooms.some((room) => room.id !== ignoreRoomId && rectsOverlap(rect, room));
}

export function createRoom(kind, rect) {
  return {
    id: `room-${kind}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: roomTemplates.find((template) => template.key === kind)?.label ?? "Room",
    color: roomTemplates.find((template) => template.key === kind)?.color ?? "#ffffff",
    ...rect
  };
}

export function createDevicePlacement(type, room, point, existingDevices) {
  if (type === "robot") {
    const existingRobot = existingDevices.find((device) => device.type === "robot");
    const robotBase = placeFreeDevice(point, room, 34);

    if (existingRobot) {
      return {
        ...existingRobot,
        roomId: room.id,
        x: robotBase.x,
        y: robotBase.y
      };
    }

    return {
      id: `robot-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: "Vacuum Robot",
      roomId: room.id,
      x: robotBase.x,
      y: robotBase.y,
      status: "idle",
      battery: 82,
      loopRoute: true,
      routeIndex: 0,
      route: []
    };
  }

  if (type === "light") {
    const placement = placeFreeDevice(point, room, 30);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: `Pendant ${existingDevices.filter((device) => device.type === type).length + 1}`,
      roomId: room.id,
      x: placement.x,
      y: placement.y,
      isOn: true,
      lightMode: "cozy"
    };
  }

  const wall = nearestWall(point, room);

  if (type === "window") {
    const placement = placeWallDevice(point, room, wall, 18);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: `Window ${existingDevices.filter((device) => device.type === type).length + 1}`,
      roomId: room.id,
      wall,
      x: placement.x,
      y: placement.y,
      isOpen: true
    };
  }

  if (type === "ac") {
    const placement = placeTv(point, room, wall);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: `AC ${existingDevices.filter((device) => device.type === type).length + 1}`,
      roomId: room.id,
      wall,
      x: placement.x,
      y: placement.y,
      isOn: true,
      temperature: 24
    };
  }

  if (type === "door") {
    const placement = placeWallDevice(point, room, wall, 24);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: `Door ${existingDevices.filter((device) => device.type === type).length + 1}`,
      roomId: room.id,
      wall,
      x: placement.x,
      y: placement.y,
      isOpen: false
    };
  }

  if (type === "tv") {
    const placement = placeTv(point, room, wall);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: `Display ${existingDevices.filter((device) => device.type === type).length + 1}`,
      roomId: room.id,
      wall,
      x: placement.x,
      y: placement.y,
      isOn: true
    };
  }

  if (type === "fridge") {
    const placement = placeTv(point, room, wall);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name: `Fridge ${existingDevices.filter((device) => device.type === type).length + 1}`,
      roomId: room.id,
      wall,
      x: placement.x,
      y: placement.y,
      isOpen: false,
      fridgeTemperature: 4,
      freezerTemperature: -18,
      fridgeItems: [],
      freezerItems: []
    };
  }

  return {
    id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: type,
    roomId: room.id,
    x: room.x + room.width / 2,
    y: room.y + room.height / 2
  };
}

export function moveDevice(device, room, point) {
  if (!room) {
    return device;
  }

  if (device.type === "light") {
    const placement = placeFreeDevice(point, room, 30);
    return { ...device, roomId: room.id, x: placement.x, y: placement.y };
  }

  if (device.type === "robot") {
    const placement = placeFreeDevice(point, room, 34);
    return { ...device, roomId: room.id, x: placement.x, y: placement.y };
  }

  const wall = nearestWall(point, room);

  if (device.type === "window" || device.type === "door") {
    const placement = placeWallDevice(point, room, wall, device.type === "door" ? 24 : 18);
    return { ...device, roomId: room.id, wall, x: placement.x, y: placement.y };
  }

  if (device.type === "ac") {
    const placement = placeTv(point, room, wall);
    return { ...device, roomId: room.id, wall, x: placement.x, y: placement.y };
  }

  if (device.type === "tv") {
    const placement = placeTv(point, room, wall);
    return { ...device, roomId: room.id, wall, x: placement.x, y: placement.y };
  }

  if (device.type === "fridge") {
    const placement = placeTv(point, room, wall);
    return { ...device, roomId: room.id, wall, x: placement.x, y: placement.y };
  }

  return device;
}

export function nearestWall(point, room) {
  const distances = [
    { wall: "north", value: Math.abs(point.y - room.y) },
    { wall: "south", value: Math.abs(point.y - (room.y + room.height)) },
    { wall: "west", value: Math.abs(point.x - room.x) },
    { wall: "east", value: Math.abs(point.x - (room.x + room.width)) }
  ];
  return distances.sort((a, b) => a.value - b.value)[0].wall;
}

function placeFreeDevice(point, room, padding) {
  return {
    x: clamp(point.x, room.x + padding, room.x + room.width - padding),
    y: clamp(point.y, room.y + padding, room.y + room.height - padding)
  };
}

function placeWallDevice(point, room, wall, padding) {
  if (wall === "north" || wall === "south") {
    return {
      x: clamp(point.x, room.x + padding, room.x + room.width - padding),
      y: wall === "north" ? room.y : room.y + room.height
    };
  }

  return {
    x: wall === "west" ? room.x : room.x + room.width,
    y: clamp(point.y, room.y + padding, room.y + room.height - padding)
  };
}

function placeTv(point, room, wall) {
  const base = placeWallDevice(point, room, wall, 28);
  const inset = 20;
  return {
    x: wall === "west" ? base.x + inset : wall === "east" ? base.x - inset : base.x,
    y: wall === "north" ? base.y + inset : wall === "south" ? base.y - inset : base.y
  };
}

function snapRectToNeighbors(rect, rooms, ignoreRoomId) {
  let next = { ...rect };
  const neighbors = rooms.filter((room) => room.id !== ignoreRoomId);

  for (const room of neighbors) {
    const roomLeft = room.x;
    const roomRight = room.x + room.width;
    const roomTop = room.y;
    const roomBottom = room.y + room.height;

    if (Math.abs(next.x - roomLeft) <= edgeSnapThreshold) {
      next.x = roomLeft;
    }
    if (Math.abs(next.x - roomRight) <= edgeSnapThreshold) {
      next.x = roomRight;
    }
    if (Math.abs(next.x + next.width - roomLeft) <= edgeSnapThreshold) {
      next.x = roomLeft - next.width;
    }
    if (Math.abs(next.x + next.width - roomRight) <= edgeSnapThreshold) {
      next.x = roomRight - next.width;
    }

    if (Math.abs(next.y - roomTop) <= edgeSnapThreshold) {
      next.y = roomTop;
    }
    if (Math.abs(next.y - roomBottom) <= edgeSnapThreshold) {
      next.y = roomBottom;
    }
    if (Math.abs(next.y + next.height - roomTop) <= edgeSnapThreshold) {
      next.y = roomTop - next.height;
    }
    if (Math.abs(next.y + next.height - roomBottom) <= edgeSnapThreshold) {
      next.y = roomBottom - next.height;
    }
  }

  return clampRoomRect(next);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
