import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  deviceTemplates,
  initialDevices,
  initialRooms,
  lightModes,
  planConfig,
  roomTemplates
} from "./homeData";
import {
  clampPoint,
  clampRoomRect,
  createDevicePlacement,
  createRoom,
  finalizeRoomRect,
  findRoomAtPoint,
  moveDevice,
  normalizeDraftRect,
  wouldOverlap
} from "./floorplanUtils";
import { fetchHomeState, postSimulationTime, pushHomeDocument, sendDeviceCommand } from "./homeApiClient";
import { buildOpenClawDeviceState } from "./openClawAdapter";

const maxHistoryEntries = 60;
const robotSpeed = 110;
const climateTickMs = 1000;
const defaultSimulationTimeMinutes = 9 * 60;

const initialState = {
  rooms: initialRooms,
  devices: initialDevices,
  simulationTimeMinutes: defaultSimulationTimeMinutes,
  environmentTemperature: 23.6,
  outdoorTemperature: computeOutdoorTemperature(defaultSimulationTimeMinutes),
  mode: "select",
  selectedRoomTemplate: roomTemplates[0].key,
  selectedDeviceTool: deviceTemplates[0].key,
  selectedRoomId: initialRooms[0].id,
  selectedDeviceId: initialDevices[0].id
};

function baseReducer(state, action) {
  switch (action.type) {
    case "set-mode":
      return {
        ...state,
        mode: action.mode,
        selectedRoomTemplate: action.roomTemplate ?? state.selectedRoomTemplate,
        selectedDeviceTool: action.deviceTool ?? state.selectedDeviceTool
      };
    case "select-room":
      return {
        ...state,
        selectedRoomId: action.roomId,
        selectedDeviceId: null
      };
    case "select-device":
      return {
        ...state,
        selectedDeviceId: action.deviceId,
        selectedRoomId: action.roomId ?? state.selectedRoomId
      };
    case "merge-remote-state":
      return mergeRemoteState(state, action.payload);
    case "clear-selection":
      return {
        ...state,
        selectedRoomId: null,
        selectedDeviceId: null
      };
    case "add-room":
      return {
        ...state,
        rooms: [...state.rooms, action.room],
        selectedRoomId: action.room.id,
        selectedDeviceId: null,
        mode: "select"
      };
    case "update-room":
      if (!hasChanges(state.rooms.find((room) => room.id === action.roomId), action.patch)) {
        return state;
      }
      return {
        ...state,
        rooms: state.rooms.map((room) => (room.id === action.roomId ? { ...room, ...action.patch } : room))
      };
    case "remove-room": {
      const rooms = state.rooms.filter((room) => room.id !== action.roomId);
      const devices = state.devices.filter((device) => device.roomId !== action.roomId);
      return {
        ...state,
        rooms,
        devices,
        selectedRoomId: rooms[0]?.id ?? null,
        selectedDeviceId: null,
        mode: "select"
      };
    }
    case "add-device": {
      const devices =
        action.device.type === "robot"
          ? [...state.devices.filter((device) => device.type !== "robot"), action.device]
          : [...state.devices, action.device];

      return {
        ...state,
        devices,
        selectedRoomId: action.device.roomId,
        selectedDeviceId: action.device.id,
        mode: "select"
      };
    }
    case "set-simulation-time": {
      const simulationTimeMinutes = normalizeTimeMinutes(action.minutes);
      return {
        ...state,
        simulationTimeMinutes,
        outdoorTemperature: computeOutdoorTemperature(simulationTimeMinutes)
      };
    }
    case "climate-step": {
      const simulationTimeMinutes = normalizeTimeMinutes(state.simulationTimeMinutes + action.deltaMs / 60000);
      const outdoorTemperature = computeOutdoorTemperature(simulationTimeMinutes);
      const climateState = {
        ...state,
        simulationTimeMinutes,
        outdoorTemperature
      };
      const nextTemperature = computeEnvironmentTemperature(climateState, action.deltaMs);

      if (
        nextTemperature === state.environmentTemperature &&
        simulationTimeMinutes === state.simulationTimeMinutes &&
        outdoorTemperature === state.outdoorTemperature
      ) {
        return state;
      }

      return {
        ...climateState,
        environmentTemperature: nextTemperature
      };
    }
    case "update-device":
      if (!hasChanges(state.devices.find((device) => device.id === action.deviceId), action.patch)) {
        return state;
      }
      return {
        ...state,
        devices: state.devices.map((device) => (device.id === action.deviceId ? { ...device, ...action.patch } : device))
      };
    case "remove-device":
      return {
        ...state,
        devices: state.devices.filter((device) => device.id !== action.deviceId),
        selectedDeviceId: null,
        mode: "select"
      };
    case "toggle-light-power":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId ? { ...device, isOn: !device.isOn } : device
        )
      };
    case "set-light-mode":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId
            ? {
                ...device,
                isOn: true,
                lightMode: action.mode
              }
            : device
        )
      };
    case "toggle-window":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId ? { ...device, isOpen: !device.isOpen } : device
        )
      };
    case "toggle-door":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId ? { ...device, isOpen: !device.isOpen } : device
        )
      };
    case "toggle-ac-power":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId ? { ...device, isOn: !device.isOn } : device
        )
      };
    case "set-ac-temperature":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId
            ? {
                ...device,
                isOn: true,
                temperature: clampTemperature(action.temperature)
              }
            : device
        )
      };
    case "toggle-tv":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId ? { ...device, isOn: !device.isOn } : device
        )
      };
    case "toggle-fridge-door":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId ? { ...device, isOpen: !device.isOpen } : device
        )
      };
    case "set-fridge-temperature":
      return {
        ...state,
        devices: state.devices.map((device) => {
          if (device.id !== action.deviceId) return device;
          const patch = {};
          if (action.fridgeTemperature != null) patch.fridgeTemperature = clampFridgeTemp(action.fridgeTemperature);
          if (action.freezerTemperature != null) patch.freezerTemperature = clampFreezerTemp(action.freezerTemperature);
          return { ...device, ...patch };
        })
      };
    case "fridge-add-item":
      return {
        ...state,
        devices: state.devices.map((device) => {
          if (device.id !== action.deviceId) return device;
          const key = action.compartment === "freezer" ? "freezerItems" : "fridgeItems";
          const items = [...(device[key] ?? [])];
          const existing = items.find((i) => i.name.toLowerCase() === action.item.name.toLowerCase());
          if (existing) {
            existing.quantity = (existing.quantity ?? 0) + (action.item.quantity ?? 1);
          } else {
            items.push({ name: action.item.name, quantity: action.item.quantity ?? 1, unit: action.item.unit ?? "pcs" });
          }
          return { ...device, [key]: items };
        })
      };
    case "fridge-remove-item":
      return {
        ...state,
        devices: state.devices.map((device) => {
          if (device.id !== action.deviceId) return device;
          const key = action.compartment === "freezer" ? "freezerItems" : "fridgeItems";
          return { ...device, [key]: (device[key] ?? []).filter((i) => i.name.toLowerCase() !== action.itemName.toLowerCase()) };
        })
      };
    case "add-robot-waypoint":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId
            ? {
                ...device,
                route: [...(device.route ?? []), action.point],
                routeIndex: 0
              }
            : device
        )
      };
    case "clear-robot-route":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId
            ? {
                ...device,
                route: [],
                routeIndex: 0,
                status: "idle"
              }
            : device
        )
      };
    case "toggle-robot-loop":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId ? { ...device, loopRoute: !device.loopRoute } : device
        )
      };
    case "start-robot":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId
            ? {
                ...device,
                status: device.route?.length ? "running" : "idle",
                routeIndex: device.routeIndex ?? 0
              }
            : device
        )
      };
    case "pause-robot":
      return {
        ...state,
        devices: state.devices.map((device) =>
          device.id === action.deviceId
            ? {
                ...device,
                status: device.status === "running" ? "paused" : "running"
              }
            : device
        )
      };
    case "robot-step":
      return {
        ...state,
        devices: state.devices.map((device) => {
          if (device.type !== "robot" || device.status !== "running" || !device.route?.length) {
            return device;
          }

          const target = device.route[device.routeIndex] ?? null;
          if (!target) {
            return {
              ...device,
              status: "idle",
              routeIndex: 0
            };
          }

          const dx = target.x - device.x;
          const dy = target.y - device.y;
          const distance = Math.hypot(dx, dy);
          const step = (action.deltaMs / 1000) * robotSpeed;

          if (distance <= step) {
            const reachedIndex = device.routeIndex + 1;
            const hasNext = reachedIndex < device.route.length;

            if (hasNext) {
              return {
                ...device,
                x: target.x,
                y: target.y,
                routeIndex: reachedIndex
              };
            }

            if (device.loopRoute) {
              return {
                ...device,
                x: target.x,
                y: target.y,
                routeIndex: 0
              };
            }

            return {
              ...device,
              x: target.x,
              y: target.y,
              routeIndex: device.route.length - 1,
              status: "idle"
            };
          }

          return {
            ...device,
            x: device.x + (dx / distance) * step,
            y: device.y + (dy / distance) * step
          };
        })
      };
    default:
      return state;
  }
}

function historyReducer(history, action) {
  if (action.type === "undo") {
    if (history.past.length === 0) {
      return history;
    }

    const previous = history.past[history.past.length - 1];
    return {
      past: history.past.slice(0, -1),
      present: preserveUiState(previous, history.present)
    };
  }

  const nextPresent = baseReducer(history.present, action);
  const snapshot = action.recordSnapshot;

  if (!shouldRecordAction(action)) {
    if (nextPresent === history.present) {
      return history;
    }

    return {
      ...history,
      present: nextPresent
    };
  }

  if (snapshot) {
    if (sameDocumentState(snapshot, nextPresent)) {
      return {
        ...history,
        present: nextPresent
      };
    }

    return {
      past: [...history.past, snapshot].slice(-maxHistoryEntries),
      present: nextPresent
    };
  }

  if (nextPresent === history.present) {
    return history;
  }

  return {
    past: [...history.past, history.present].slice(-maxHistoryEntries),
    present: nextPresent
  };
}

function App() {
  const [history, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initialState
  });
  const [apiConnected, setApiConnected] = useState(false);
  const [interaction, setInteraction] = useState(null);
  const [robotRouteEditing, setRobotRouteEditing] = useState(false);
  const lastDocumentSyncRef = useRef("");
  const robotAnimationRef = useRef(null);
  const state = history.present;
  const canUndo = history.past.length > 0;

  const selectedRoom = state.rooms.find((room) => room.id === state.selectedRoomId) ?? null;
  const selectedDevice = state.devices.find((device) => device.id === state.selectedDeviceId) ?? null;
  const robot = state.devices.find((device) => device.type === "robot") ?? null;
  const roomDevices = useMemo(
    () => state.devices.filter((device) => device.roomId === state.selectedRoomId),
    [state.devices, state.selectedRoomId]
  );
  const openWindowCount = useMemo(
    () => state.devices.filter((device) => device.type === "window" && device.isOpen).length,
    [state.devices]
  );
  const activeAcCount = useMemo(
    () => state.devices.filter((device) => device.type === "ac" && device.isOn).length,
    [state.devices]
  );

  useEffect(() => {
    if (selectedDevice?.type !== "robot") {
      setRobotRouteEditing(false);
    }
  }, [selectedDevice?.type]);

  useEffect(() => {
    function handleKeyDown(event) {
      const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
      if (!isUndo || !canUndo) {
        return;
      }

      event.preventDefault();
      setInteraction(null);
      setRobotRouteEditing(false);
      dispatch({ type: "undo" });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo]);

  useEffect(() => {
    if (apiConnected) {
      robotAnimationRef.current = null;
      return;
    }

    if (!robot || robot.status !== "running" || !robot.route?.length) {
      robotAnimationRef.current = null;
      return;
    }

    let frameId = 0;
    let last = performance.now();

    function step(now) {
      const deltaMs = now - last;
      last = now;
      dispatch({
        type: "robot-step",
        deltaMs,
        record: false
      });
      frameId = window.requestAnimationFrame(step);
    }

    frameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [apiConnected, robot?.id, robot?.status, robot?.route?.length]);

  useEffect(() => {
    if (apiConnected) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      dispatch({
        type: "climate-step",
        deltaMs: climateTickMs,
        record: false
      });
    }, climateTickMs);

    return () => window.clearInterval(intervalId);
  }, [apiConnected]);

  useEffect(() => {
    let cancelled = false;

    async function syncRemoteState() {
      try {
        const remoteState = await fetchHomeState();
        if (cancelled) {
          return;
        }

        setApiConnected(true);
        dispatch({
          type: "merge-remote-state",
          payload: remoteState,
          record: false
        });
      } catch {
        if (!cancelled) {
          setApiConnected(false);
        }
      }
    }

    syncRemoteState();
    const intervalId = window.setInterval(syncRemoteState, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!apiConnected) {
      return undefined;
    }

    const documentSnapshot = JSON.stringify({
      rooms: state.rooms,
      devices: state.devices
    });

    if (documentSnapshot === lastDocumentSyncRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        await pushHomeDocument({
          rooms: state.rooms,
          devices: state.devices
        });
        lastDocumentSyncRef.current = documentSnapshot;
      } catch (error) {
        console.error("Failed to sync floorplan document with API", error);
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [apiConnected, state.rooms, state.devices]);

  const helperText = useMemo(() => {
    if (robotRouteEditing && selectedDevice?.type === "robot") {
      return "Route edit is armed. Click anywhere on the 2D plan to add a robot waypoint.";
    }

    if (state.mode === "draw-room") {
      const template = roomTemplates.find((item) => item.key === state.selectedRoomTemplate);
      return `Drag on the plan to draw a ${template?.label.toLowerCase() ?? "room"}. Snap happens on release.`;
    }

    if (state.mode === "place-device") {
      const template = deviceTemplates.find((item) => item.key === state.selectedDeviceTool);
      return template?.hint ?? "Click inside a room to place the selected device.";
    }

    if (state.mode === "delete") {
      return "Click any room or device on the plan to remove it.";
    }

    if (selectedDevice?.type === "light") {
      return "Double-click the light for a quick power toggle, or use the floating device card to switch power and light mode.";
    }

    if (selectedDevice?.type === "ac") {
      return "Double-click the AC for a quick power toggle, or use the floating card to adjust the target indoor temperature.";
    }

    if (selectedDevice?.type === "fridge") {
      return "Double-click the fridge to toggle the door. Use the floating card to adjust temperatures and view stored items.";
    }

    if (selectedDevice?.type === "robot") {
      return "Double-click the robot to start or pause movement, or use the floating robot card to edit the route and looping.";
    }

    if (selectedDevice) {
      return "Double-click the selected device for a quick toggle, or use the floating control card on the plan.";
    }

    return "Select a room or device, then drag it directly on the plan. The floorplan snaps only when you release.";
  }, [robotRouteEditing, selectedDevice, state.mode, state.selectedDeviceTool, state.selectedRoomTemplate]);

  function beginCapture(svg, pointerId) {
    if (svg && pointerId != null) {
      svg.setPointerCapture(pointerId);
    }
  }

  function endCapture(svg, pointerId) {
    if (svg && pointerId != null && svg.hasPointerCapture(pointerId)) {
      svg.releasePointerCapture(pointerId);
    }
  }

  function handleCanvasPointerDown(event, svg) {
    const point = getSvgPoint(event, svg);

    if (robotRouteEditing && selectedDevice?.type === "robot") {
      const room = findRoomAtPoint(state.rooms, point);
      if (room) {
        dispatch({
          type: "add-robot-waypoint",
          deviceId: selectedDevice.id,
          point: {
            x: point.x,
            y: point.y
          }
        });
      }
      return;
    }

    if (state.mode === "draw-room") {
      beginCapture(svg, event.pointerId);
      setInteraction({
        type: "draw-room",
        pointerId: event.pointerId,
        start: point,
        current: point
      });
      return;
    }

    if (state.mode === "select") {
      dispatch({ type: "clear-selection" });
    }
  }

  function handleRoomPointerDown(event, room, svg) {
    event.stopPropagation();
    const point = getSvgPoint(event, svg);

    if (robotRouteEditing && selectedDevice?.type === "robot") {
      dispatch({
        type: "add-robot-waypoint",
        deviceId: selectedDevice.id,
        point: {
          x: point.x,
          y: point.y
        }
      });
      return;
    }

    if (state.mode === "place-device") {
      const nextDevice = createDevicePlacement(state.selectedDeviceTool, room, point, state.devices);
      dispatch({ type: "add-device", device: nextDevice });
      return;
    }

    if (state.mode === "delete") {
      dispatch({ type: "remove-room", roomId: room.id });
      return;
    }

    dispatch({ type: "select-room", roomId: room.id });

    if (state.mode === "select") {
      beginCapture(svg, event.pointerId);
      setInteraction({
        type: "drag-room",
        pointerId: event.pointerId,
        roomId: room.id,
        originalRoom: room,
        start: point,
        historySnapshot: state
      });
    }
  }

  function handleDevicePointerDown(event, device, svg) {
    event.stopPropagation();
    const point = getSvgPoint(event, svg);

    if (state.mode === "delete") {
      dispatch({ type: "remove-device", deviceId: device.id });
      return;
    }

    dispatch({ type: "select-device", deviceId: device.id, roomId: device.roomId });

    if (state.mode === "select") {
      beginCapture(svg, event.pointerId);
      setInteraction({
        type: "drag-device",
        pointerId: event.pointerId,
        deviceId: device.id,
        originalDevice: device,
        lastPoint: point,
        lastRoomId: device.roomId,
        historySnapshot: state
      });
    }
  }

  function handleCanvasPointerMove(event, svg) {
    if (!interaction) {
      return;
    }

    const point = getSvgPoint(event, svg);

    if (interaction.type === "draw-room") {
      setInteraction((current) => (current ? { ...current, current: point } : current));
      return;
    }

    if (interaction.type === "drag-room") {
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      const movedRect = clampRoomRect({
        ...interaction.originalRoom,
        x: interaction.originalRoom.x + dx,
        y: interaction.originalRoom.y + dy
      });

      dispatch({
        type: "update-room",
        roomId: interaction.roomId,
        patch: {
          x: movedRect.x,
          y: movedRect.y
        },
        record: false
      });
      return;
    }

    if (interaction.type === "drag-device") {
      const nextRoom =
        findRoomAtPoint(state.rooms, point) ??
        state.rooms.find((room) => room.id === interaction.lastRoomId) ??
        state.rooms.find((room) => room.id === interaction.originalDevice.roomId);

      if (!nextRoom) {
        return;
      }

      const nextDevice = moveDevice(interaction.originalDevice, nextRoom, point);
      dispatch({
        type: "update-device",
        deviceId: interaction.deviceId,
        patch: {
          roomId: nextDevice.roomId,
          x: nextDevice.x,
          y: nextDevice.y,
          wall: nextDevice.wall
        },
        record: false
      });

      setInteraction((current) =>
        current
          ? {
              ...current,
              lastPoint: point,
              lastRoomId: nextRoom.id
            }
          : current
      );
    }
  }

  function handleCanvasPointerUp(event, svg) {
    if (!interaction) {
      return;
    }

    const point = getSvgPoint(event, svg);

    if (interaction.type === "draw-room") {
      if (Math.abs(point.x - interaction.start.x) < 16 && Math.abs(point.y - interaction.start.y) < 16) {
        endCapture(svg, interaction.pointerId);
        setInteraction(null);
        return;
      }

      const rawRect = normalizeDraftRect(interaction.start, point);
      const finalRect = finalizeRoomRect(rawRect, state.rooms);

      if (!wouldOverlap(finalRect, state.rooms)) {
        dispatch({
          type: "add-room",
          room: createRoom(state.selectedRoomTemplate, finalRect)
        });
      }
    }

    if (interaction.type === "drag-room") {
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      const movedRect = clampRoomRect({
        ...interaction.originalRoom,
        x: interaction.originalRoom.x + dx,
        y: interaction.originalRoom.y + dy
      });
      const finalRect = finalizeRoomRect(movedRect, state.rooms, interaction.roomId);

      if (wouldOverlap(finalRect, state.rooms, interaction.roomId)) {
        dispatch({
          type: "update-room",
          roomId: interaction.roomId,
          patch: {
            x: interaction.originalRoom.x,
            y: interaction.originalRoom.y
          },
          record: false
        });
      } else {
        dispatch({
          type: "update-room",
          roomId: interaction.roomId,
          patch: {
            x: finalRect.x,
            y: finalRect.y,
            width: finalRect.width,
            height: finalRect.height
          },
          recordSnapshot: interaction.historySnapshot
        });
      }
    }

    if (interaction.type === "drag-device") {
      const targetRoom =
        findRoomAtPoint(state.rooms, point) ??
        state.rooms.find((room) => room.id === interaction.lastRoomId) ??
        state.rooms.find((room) => room.id === interaction.originalDevice.roomId);

      if (!targetRoom) {
        dispatch({
          type: "update-device",
          deviceId: interaction.deviceId,
          patch: {
            roomId: interaction.originalDevice.roomId,
            x: interaction.originalDevice.x,
            y: interaction.originalDevice.y,
            wall: interaction.originalDevice.wall
          },
          record: false
        });
      } else {
        const finalDevice = moveDevice(interaction.originalDevice, targetRoom, point);
        dispatch({
          type: "update-device",
          deviceId: interaction.deviceId,
          patch: {
            roomId: finalDevice.roomId,
            x: finalDevice.x,
            y: finalDevice.y,
            wall: finalDevice.wall
          },
          recordSnapshot: interaction.historySnapshot
        });
      }
    }

    endCapture(svg, interaction.pointerId);
    setInteraction(null);
  }

  function applyLocalDeviceCommand(device, command) {
    if (command.type === "toggle-light-power") {
      dispatch({ type: "toggle-light-power", deviceId: device.id });
      return;
    }
    if (command.type === "set-light-mode") {
      dispatch({ type: "set-light-mode", deviceId: device.id, mode: command.mode });
      return;
    }
    if (command.type === "toggle-window") {
      dispatch({ type: "toggle-window", deviceId: device.id });
      return;
    }
    if (command.type === "toggle-door") {
      dispatch({ type: "toggle-door", deviceId: device.id });
      return;
    }
    if (command.type === "toggle-ac-power") {
      dispatch({ type: "toggle-ac-power", deviceId: device.id });
      return;
    }
    if (command.type === "set-ac-temperature") {
      dispatch({
        type: "set-ac-temperature",
        deviceId: device.id,
        temperature: command.temperature
      });
      return;
    }
    if (command.type === "toggle-tv") {
      dispatch({ type: "toggle-tv", deviceId: device.id });
      return;
    }
    if (command.type === "toggle-fridge-door") {
      dispatch({ type: "toggle-fridge-door", deviceId: device.id });
      return;
    }
    if (command.type === "set-fridge-temperature") {
      dispatch({
        type: "set-fridge-temperature",
        deviceId: device.id,
        fridgeTemperature: command.fridgeTemperature,
        freezerTemperature: command.freezerTemperature
      });
      return;
    }
    if (command.type === "fridge-add-item") {
      dispatch({
        type: "fridge-add-item",
        deviceId: device.id,
        compartment: command.compartment,
        item: command.item
      });
      return;
    }
    if (command.type === "fridge-remove-item") {
      dispatch({
        type: "fridge-remove-item",
        deviceId: device.id,
        compartment: command.compartment,
        itemName: command.itemName
      });
      return;
    }
    if (command.type === "clear-robot-route") {
      dispatch({ type: "clear-robot-route", deviceId: device.id });
      setRobotRouteEditing(false);
      return;
    }
    if (command.type === "toggle-robot-loop") {
      dispatch({ type: "toggle-robot-loop", deviceId: device.id });
      return;
    }
    if (command.type === "start-robot") {
      dispatch({ type: "start-robot", deviceId: device.id });
      setRobotRouteEditing(false);
      return;
    }
    if (command.type === "pause-robot") {
      dispatch({ type: "pause-robot", deviceId: device.id });
      return;
    }
    if (command.type === "toggle-route-editing") {
      setRobotRouteEditing((current) => !current);
    }
  }

  async function executeDeviceCommand(device, command) {
    applyLocalDeviceCommand(device, command);

    if (!apiConnected || command.type === "toggle-route-editing") {
      return;
    }

    try {
      const remoteState = await sendDeviceCommand(device, command);
      if (remoteState) {
        dispatch({
          type: "merge-remote-state",
          payload: remoteState,
          record: false
        });
      }
    } catch (error) {
      console.error(`Failed to sync ${device.id} with API`, error);
    }
  }

  async function handleDeviceCommand(command) {
    if (!selectedDevice) {
      return;
    }

    await executeDeviceCommand(selectedDevice, command);
  }

  function handleDeviceQuickAction(device) {
    const command = getQuickActionCommand(device);
    if (!command) {
      return;
    }

    void executeDeviceCommand(device, command);
  }

  async function handleSimulationTimeChange(minutes) {
    dispatch({
      type: "set-simulation-time",
      minutes,
      record: false
    });

    if (!apiConnected) {
      return;
    }

    try {
      const remoteState = await postSimulationTime(minutes);
      dispatch({
        type: "merge-remote-state",
        payload: remoteState,
        record: false
      });
    } catch (error) {
      console.error("Failed to sync simulation time with API", error);
    }
  }

  const draftRect =
    interaction?.type === "draw-room" ? normalizeDraftRect(interaction.start, interaction.current) : null;
  const apiPreview = selectedDevice
    ? buildOpenClawDeviceState(selectedDevice, {
        environmentTemperature: state.environmentTemperature,
        outdoorTemperature: state.outdoorTemperature,
        simulationTime: formatTimeLabel(state.simulationTimeMinutes, true)
      })
    : null;

  return (
    <div className="cad-app">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <div className="sidebar-header">
            <div>
              <p className="eyebrow">2D Control + Layout</p>
              <h1>Plan Editor</h1>
            </div>
            <p className="sidebar-copy">Now optimized for direct device control, visual state display, and future OpenClaw API mapping.</p>
          </div>

          <section className="sidebar-toolbar">
            <button
              className="undo-button"
              disabled={!canUndo}
              onClick={() => {
                setInteraction(null);
                setRobotRouteEditing(false);
                dispatch({ type: "undo" });
              }}
            >
              Undo Last Edit
            </button>
            <div className="toolbar-meta">
              <span className="meta-pill">Time: {formatTimeLabel(state.simulationTimeMinutes, true)}</span>
              <span className="meta-pill">Indoor: {formatTemperature(state.environmentTemperature)}</span>
              <span className="meta-pill">Outdoor: {formatTemperature(state.outdoorTemperature)}</span>
              <span className="meta-pill">Mode: {humanizeMode(state.mode)}</span>
              <span className="meta-pill">{state.rooms.length} rooms</span>
              <span className="meta-pill">{state.devices.length} devices</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Environment</h2>
              <span>Global climate</span>
            </div>
            <div className="time-panel">
              <div className="time-panel-header">
                <strong>{formatTimeLabel(state.simulationTimeMinutes, true)}</strong>
                <span>Demo time</span>
              </div>
              <input
                className="time-slider"
                type="range"
                min="0"
                max="1439"
                step="1"
                value={state.simulationTimeMinutes}
                onChange={(event) => {
                  void handleSimulationTimeChange(Number(event.target.value));
                }}
              />
            </div>
            <div className="metric-grid">
              <div className="metric-card">
                <strong>{formatTemperature(state.environmentTemperature)}</strong>
                <span>Indoor now</span>
              </div>
              <div className="metric-card">
                <strong>{formatTemperature(state.outdoorTemperature)}</strong>
                <span>Outdoor from time</span>
              </div>
              <div className="metric-card">
                <strong>{activeAcCount}</strong>
                <span>AC units on</span>
              </div>
              <div className="metric-card">
                <strong>{openWindowCount}</strong>
                <span>Windows open</span>
              </div>
            </div>
            <p className="metric-note">Time drives outdoor temperature. AC pulls indoor temperature toward its target fastest, windows pull it toward outdoor temperature next, and the closed home drifts most slowly.</p>
          </section>

          <section className="panel accent-panel">
            <div className="panel-header">
              <h2>Workflow</h2>
            </div>
            <div className="tool-grid">
              <button
                className={`tool-button ${state.mode === "select" ? "active" : ""}`}
                onClick={() => dispatch({ type: "set-mode", mode: "select" })}
              >
                <strong>Select / Drag</strong>
                <span>Move rooms and devices directly.</span>
              </button>
              <button
                className={`tool-button ${state.mode === "draw-room" ? "active" : ""}`}
                onClick={() =>
                  dispatch({
                    type: "set-mode",
                    mode: "draw-room",
                    roomTemplate: state.selectedRoomTemplate
                  })
                }
              >
                <strong>Draw Room</strong>
                <span>Create a room by drag.</span>
              </button>
              <button
                className={`tool-button ${state.mode === "place-device" ? "active" : ""}`}
                onClick={() =>
                  dispatch({
                    type: "set-mode",
                    mode: "place-device",
                    deviceTool: state.selectedDeviceTool
                  })
                }
              >
                <strong>Add Device</strong>
                <span>Pick a type, then click a room.</span>
              </button>
              <button
                className={`tool-button danger ${state.mode === "delete" ? "active" : ""}`}
                onClick={() => dispatch({ type: "set-mode", mode: "delete" })}
              >
                <strong>Delete</strong>
                <span>Remove rooms or devices.</span>
              </button>
            </div>
            <div className="helper-card">
              <strong>Current guidance</strong>
              <p className="helper-text">{helperText}</p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Room Type</h2>
            </div>
            <div className="chip-grid">
              {roomTemplates.map((template) => (
                <button
                  key={template.key}
                  className={`chip ${state.selectedRoomTemplate === template.key ? "active" : ""}`}
                  onClick={() =>
                    dispatch({
                      type: "set-mode",
                      mode: "draw-room",
                      roomTemplate: template.key
                    })
                  }
                >
                  {template.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Device Tool</h2>
              <span>{selectedRoom?.name ?? "Any room"}</span>
            </div>
            <div className="chip-grid">
              {deviceTemplates.map((template) => (
                <button
                  key={template.key}
                  className={`chip ${state.selectedDeviceTool === template.key ? "active" : ""}`}
                  onClick={() =>
                    dispatch({
                      type: "set-mode",
                      mode: "place-device",
                      deviceTool: template.key
                    })
                  }
                >
                  {toolLabel(template.key)}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Current Selection</h2>
            </div>
            {selectedDevice ? (
              <div className="selection-card">
                <strong>{selectedDevice.name}</strong>
                <span>{deviceStatus(selectedDevice, state.environmentTemperature)}</span>
                <button className="inline-remove" onClick={() => dispatch({ type: "remove-device", deviceId: selectedDevice.id })}>
                  Remove selected device
                </button>
              </div>
            ) : selectedRoom ? (
              <div className="selection-card">
                <strong>{selectedRoom.name}</strong>
                <span>
                  {Math.round(selectedRoom.width)} x {Math.round(selectedRoom.height)}
                </span>
                <button className="inline-remove" onClick={() => dispatch({ type: "remove-room", roomId: selectedRoom.id })}>
                  Remove selected room
                </button>
              </div>
            ) : (
              <p className="empty-state">Nothing selected.</p>
            )}
          </section>

          {selectedDevice && (
            <section className="panel">
              <div className="panel-header">
                <h2>API Preview</h2>
                <span>OpenClaw-ready</span>
              </div>
              <pre className="api-preview">{JSON.stringify(apiPreview, null, 2)}</pre>
            </section>
          )}

          <section className="panel">
            <div className="panel-header">
              <h2>Room Inventory</h2>
            </div>
            <div className="inventory-list">
              {roomDevices.map((device) => (
                <button
                  key={device.id}
                  className={`inventory-item ${state.selectedDeviceId === device.id ? "active" : ""}`}
                  onClick={() => dispatch({ type: "select-device", deviceId: device.id, roomId: device.roomId })}
                >
                  <strong>{device.name}</strong>
                  <span>{deviceStatus(device, state.environmentTemperature)}</span>
                </button>
              ))}
              {roomDevices.length === 0 && <p className="empty-state">The selected room has no devices yet.</p>}
            </div>
          </section>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Interactive 2D Device Control</p>
            <h2>Single 2D Working Surface</h2>
          </div>
          <div className="workspace-meta">
            <span>{formatTimeLabel(state.simulationTimeMinutes, true)}</span>
            <span>Indoor {formatTemperature(state.environmentTemperature)}</span>
            <span>Outdoor {formatTemperature(state.outdoorTemperature)}</span>
            <span>{activeAcCount} AC on</span>
            <span>{openWindowCount} windows open</span>
            <span>{state.rooms.length} rooms</span>
            <span>{state.devices.length} devices</span>
            <span>{humanizeMode(state.mode)}</span>
          </div>
        </header>

        <section className="board">
          <PlanCanvas
            rooms={state.rooms}
            devices={state.devices}
            robot={robot}
            mode={state.mode}
            simulationTimeMinutes={state.simulationTimeMinutes}
            environmentTemperature={state.environmentTemperature}
            selectedRoomId={state.selectedRoomId}
            selectedDevice={selectedDevice}
            draftRect={draftRect}
            robotRouteEditing={robotRouteEditing}
            onCanvasPointerDown={handleCanvasPointerDown}
            onRoomPointerDown={handleRoomPointerDown}
            onDevicePointerDown={handleDevicePointerDown}
            onCanvasPointerMove={handleCanvasPointerMove}
            onCanvasPointerUp={handleCanvasPointerUp}
            onDeviceCommand={handleDeviceCommand}
            onDeviceQuickAction={handleDeviceQuickAction}
          />
        </section>
      </main>
    </div>
  );
}

function PlanCanvas({
  rooms,
  devices,
  robot,
  mode,
  simulationTimeMinutes,
  environmentTemperature,
  selectedRoomId,
  selectedDevice,
  draftRect,
  robotRouteEditing,
  onCanvasPointerDown,
  onRoomPointerDown,
  onDevicePointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onDeviceCommand,
  onDeviceQuickAction
}) {
  const svgRef = useRef(null);

  return (
    <div className={`plan-shell mode-${mode}`}>
      <svg
        ref={svgRef}
        className="plan-svg"
        viewBox={`0 0 ${planConfig.width} ${planConfig.height}`}
        onPointerDown={(event) => onCanvasPointerDown(event, svgRef.current)}
        onPointerMove={(event) => onCanvasPointerMove(event, svgRef.current)}
        onPointerUp={(event) => onCanvasPointerUp(event, svgRef.current)}
        onPointerCancel={(event) => onCanvasPointerUp(event, svgRef.current)}
      >
        <defs>
          <pattern id="cadGrid" width={planConfig.grid} height={planConfig.grid} patternUnits="userSpaceOnUse">
            <path d={`M ${planConfig.grid} 0 L 0 0 0 ${planConfig.grid}`} fill="none" stroke="#dbe4ef" strokeWidth="1" />
          </pattern>
          <filter id="lightGlow" x="-120%" y="-120%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={planConfig.width} height={planConfig.height} fill="url(#cadGrid)" />

        {rooms.map((room) => (
          <RoomShape
            key={room.id}
            room={room}
            simulationTimeMinutes={simulationTimeMinutes}
            selected={room.id === selectedRoomId}
            onPointerDown={(event) => onRoomPointerDown(event, room, svgRef.current)}
          />
        ))}

        {robot && <RobotRouteLayer robot={robot} routeEditing={robotRouteEditing} />}

        {devices.map((device) => (
          <DeviceSymbol
            key={device.id}
            device={device}
            environmentTemperature={environmentTemperature}
            selected={device.id === selectedDevice?.id}
            onPointerDown={(event) => onDevicePointerDown(event, device, svgRef.current)}
            onDoubleClick={(event) => {
              if (mode !== "select") {
                return;
              }
              event.stopPropagation();
              onDeviceQuickAction(device);
            }}
          />
        ))}

        {draftRect && (
          <rect
            x={draftRect.x}
            y={draftRect.y}
            width={draftRect.width}
            height={draftRect.height}
            className="draft-room"
            pointerEvents="none"
          />
        )}
      </svg>

      {selectedDevice && (
        <DeviceControlCard
          device={selectedDevice}
          environmentTemperature={environmentTemperature}
          robotRouteEditing={robotRouteEditing}
          onCommand={onDeviceCommand}
        />
      )}
    </div>
  );
}

function RoomShape({ room, simulationTimeMinutes, selected, onPointerDown }) {
  const centerX = room.x + room.width / 2;
  const centerY = room.y + room.height / 2;

  return (
    <g onPointerDown={onPointerDown}>
      <rect
        x={room.x}
        y={room.y}
        width={room.width}
        height={room.height}
        className="room-fill"
        style={{ fill: room.color }}
      />
      <rect x={room.x} y={room.y} width={room.width} height={room.height} className="room-wall" />
      {selected && <rect x={room.x + 6} y={room.y + 6} width={room.width - 12} height={room.height - 12} className="room-selected" />}
      <text x={centerX} y={centerY - 6} className="room-name" textAnchor="middle">
        {room.name}
      </text>
      <text x={centerX} y={centerY + 18} className="room-size" textAnchor="middle">
        {Math.round(room.width)} × {Math.round(room.height)}
      </text>
      {room.kind === "living" && <LivingRoomClock room={room} simulationTimeMinutes={simulationTimeMinutes} />}
    </g>
  );
}

function LivingRoomClock({ room, simulationTimeMinutes }) {
  const clockX = room.x + 56;
  const clockY = room.y + 58;
  const hourAngle = ((simulationTimeMinutes / 60) % 12) * 30 - 90;
  const minuteAngle = (simulationTimeMinutes % 60) * 6 - 90;
  const secondAngle = ((simulationTimeMinutes * 60) % 60) * 6 - 90;

  return (
    <g className="room-clock" pointerEvents="none" transform={`translate(${clockX}, ${clockY})`}>
      <circle r="22" className="room-clock-rim" />
      <circle r="17" className="room-clock-face" />
      <line
        x1="0"
        y1="0"
        x2={Math.cos((hourAngle * Math.PI) / 180) * 8}
        y2={Math.sin((hourAngle * Math.PI) / 180) * 8}
        className="room-clock-hand hour"
      />
      <line
        x1="0"
        y1="0"
        x2={Math.cos((minuteAngle * Math.PI) / 180) * 12}
        y2={Math.sin((minuteAngle * Math.PI) / 180) * 12}
        className="room-clock-hand minute"
      />
      <line
        x1="0"
        y1="0"
        x2={Math.cos((secondAngle * Math.PI) / 180) * 14}
        y2={Math.sin((secondAngle * Math.PI) / 180) * 14}
        className="room-clock-hand second"
      />
      <circle r="2.5" className="room-clock-center" />
      <text y="36" textAnchor="middle" className="room-clock-label">
        {formatTimeLabel(simulationTimeMinutes, true)}
      </text>
    </g>
  );
}

function RobotRouteLayer({ robot, routeEditing }) {
  if (!robot) {
    return null;
  }

  const points = [
    { x: robot.x, y: robot.y },
    ...(robot.route ?? [])
  ];

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <g pointerEvents="none">
      {robot.route?.length > 0 && (
        <polyline
          points={polyline}
          className={`robot-route ${robot.loopRoute ? "looping" : ""}`}
        />
      )}
      {robot.route?.map((point, index) => (
        <g key={`${point.x}-${point.y}-${index}`} transform={`translate(${point.x}, ${point.y})`}>
          <circle r="11" className={`route-node ${routeEditing ? "editing" : ""}`} />
          <text textAnchor="middle" dy="4" className="route-node-label">
            {index + 1}
          </text>
        </g>
      ))}
    </g>
  );
}

function DeviceSymbol({ device, environmentTemperature, selected, onPointerDown, onDoubleClick }) {
  return (
    <g
      className={`device-symbol ${selected ? "selected" : ""}`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {device.type === "light" && <LightSymbol device={device} />}
      {device.type === "window" && <WindowSymbol device={device} />}
      {device.type === "door" && <DoorSymbol device={device} />}
      {device.type === "ac" && <AcSymbol device={device} environmentTemperature={environmentTemperature} />}
      {device.type === "tv" && <TvSymbol device={device} />}
      {device.type === "fridge" && <FridgeSymbol device={device} />}
      {device.type === "robot" && <RobotSymbol device={device} />}
    </g>
  );
}

function LightSymbol({ device }) {
  const mode = lightModes.find((item) => item.key === device.lightMode) ?? lightModes[0];

  return (
    <g transform={`translate(${device.x}, ${device.y})`} filter={device.isOn ? "url(#lightGlow)" : undefined}>
      <circle r="16" className="device-light-ring" />
      <circle r="11" className="device-light-core" fill={device.isOn ? mode.color : "#cbd5e1"} />
      <line x1="-8" y1="0" x2="8" y2="0" className="device-line" />
      <line x1="0" y1="-8" x2="0" y2="8" className="device-line" />
    </g>
  );
}

function WindowSymbol({ device }) {
  const openClass = device.isOpen ? "is-open" : "is-closed";

  if (device.wall === "north" || device.wall === "south") {
    return (
      <g transform={`translate(${device.x}, ${device.y})`} className={`window-symbol ${openClass}`}>
        <line x1="-18" y1="0" x2="18" y2="0" className="window-line" />
        <line x1="-11" y1="-6" x2="-4" y2="6" className="window-pane" />
        <line x1="4" y1="-6" x2="11" y2="6" className="window-pane" />
      </g>
    );
  }

  return (
    <g transform={`translate(${device.x}, ${device.y})`} className={`window-symbol ${openClass}`}>
      <line x1="0" y1="-18" x2="0" y2="18" className="window-line" />
      <line x1="-6" y1="-11" x2="6" y2="-4" className="window-pane" />
      <line x1="-6" y1="4" x2="6" y2="11" className="window-pane" />
    </g>
  );
}

function DoorSymbol({ device }) {
  const x = device.x;
  const y = device.y;

  if (device.wall === "north") {
    return (
      <g className={`door-symbol ${device.isOpen ? "is-open" : "is-closed"}`}>
        <line x1={x - 18} y1={y} x2={x + 18} y2={y} className="door-jamb" />
        <circle cx={x - 18} cy={y} r="2.5" className="door-hinge" />
        <line x1={x - 18} y1={y} x2={device.isOpen ? x + 10 : x + 18} y2={device.isOpen ? y + 28 : y} className="door-leaf" />
        <path d={`M ${x - 18} ${y + 28} A 28 28 0 0 1 ${x + 10} ${y}`} className="door-arc" />
      </g>
    );
  }

  if (device.wall === "south") {
    return (
      <g className={`door-symbol ${device.isOpen ? "is-open" : "is-closed"}`}>
        <line x1={x - 18} y1={y} x2={x + 18} y2={y} className="door-jamb" />
        <circle cx={x + 18} cy={y} r="2.5" className="door-hinge" />
        <line x1={x + 18} y1={y} x2={device.isOpen ? x - 10 : x - 18} y2={device.isOpen ? y - 28 : y} className="door-leaf" />
        <path d={`M ${x + 18} ${y - 28} A 28 28 0 0 0 ${x - 10} ${y}`} className="door-arc" />
      </g>
    );
  }

  if (device.wall === "west") {
    return (
      <g className={`door-symbol ${device.isOpen ? "is-open" : "is-closed"}`}>
        <line x1={x} y1={y - 18} x2={x} y2={y + 18} className="door-jamb" />
        <circle cx={x} cy={y + 18} r="2.5" className="door-hinge" />
        <line x1={x} y1={y + 18} x2={device.isOpen ? x + 28 : x} y2={device.isOpen ? y - 10 : y - 18} className="door-leaf" />
        <path d={`M ${x + 28} ${y + 18} A 28 28 0 0 0 ${x} ${y - 10}`} className="door-arc" />
      </g>
    );
  }

  return (
    <g className={`door-symbol ${device.isOpen ? "is-open" : "is-closed"}`}>
      <line x1={x} y1={y - 18} x2={x} y2={y + 18} className="door-jamb" />
      <circle cx={x} cy={y - 18} r="2.5" className="door-hinge" />
      <line x1={x} y1={y - 18} x2={device.isOpen ? x - 28 : x} y2={device.isOpen ? y + 10 : y + 18} className="door-leaf" />
      <path d={`M ${x - 28} ${y - 18} A 28 28 0 0 1 ${x} ${y + 10}`} className="door-arc" />
    </g>
  );
}

function TvSymbol({ device }) {
  return (
    <g transform={`translate(${device.x}, ${device.y})`} className={device.isOn ? "tv-symbol on" : "tv-symbol off"}>
      <rect x="-18" y="-12" width="36" height="22" rx="2" className="tv-frame" />
      <rect x="-13" y="-8" width="26" height="14" className="tv-screen" />
      <line x1="-8" y1="14" x2="8" y2="14" className="device-line" />
    </g>
  );
}

function FridgeSymbol({ device }) {
  const fridgeCount = (device.fridgeItems ?? []).length;
  const freezerCount = (device.freezerItems ?? []).length;
  const totalItems = fridgeCount + freezerCount;

  return (
    <g transform={`translate(${device.x}, ${device.y})`} className={`fridge-symbol ${device.isOpen ? "open" : "closed"}`}>
      <rect x="-16" y="-22" width="32" height="44" rx="3" className="fridge-body" />
      <line x1="-14" y1="-2" x2="14" y2="-2" className="fridge-divider" />
      <rect x="-12" y="-19" width="24" height="14" rx="1.5" className="fridge-compartment freezer-zone" />
      <rect x="-12" y="1" width="24" height="16" rx="1.5" className="fridge-compartment fridge-zone" />
      <line x1="10" y1="-15" x2="10" y2="-9" className="fridge-handle" />
      <line x1="10" y1="5" x2="10" y2="13" className="fridge-handle" />
      <circle cx="-10" cy="-12" r="2" className="fridge-led" />
      <text x="0" y="34" textAnchor="middle" className="fridge-label">
        {device.fridgeTemperature}°/{device.freezerTemperature}°
      </text>
      {totalItems > 0 && (
        <g transform="translate(16, -22)">
          <circle r="8" className="fridge-badge" />
          <text textAnchor="middle" dy="3.5" className="fridge-badge-text">{totalItems}</text>
        </g>
      )}
    </g>
  );
}

function AcSymbol({ device, environmentTemperature }) {
  return (
    <g transform={`translate(${device.x}, ${device.y})`} className={device.isOn ? "ac-symbol on" : "ac-symbol off"}>
      <rect x="-21" y="-10" width="42" height="20" rx="4" className="ac-shell" />
      <line x1="-14" y1="-1" x2="14" y2="-1" className="ac-vent" />
      <line x1="-11" y1="4" x2="11" y2="4" className="ac-vent" />
      <circle cx="13" cy="-4" r="2" className="ac-led" />
      <text x="0" y="28" textAnchor="middle" className="ac-temp-label">
        {formatTemperature(environmentTemperature)}
      </text>
    </g>
  );
}

function RobotSymbol({ device }) {
  return (
    <g transform={`translate(${device.x}, ${device.y})`} className={`robot-symbol ${device.status}`}>
      <circle r="15" className="robot-body" />
      <circle r="5" className="robot-core" />
      <path d="M -4 -2 L 6 0 L -2 7 Z" className="robot-arrow" />
    </g>
  );
}

function DeviceControlCard({ device, environmentTemperature, robotRouteEditing, onCommand }) {
  const position = getDeviceCardPosition(device);
  const lightMode = lightModes.find((mode) => mode.key === device.lightMode) ?? lightModes[0];

  return (
    <div className="device-control-card" style={position}>
      <div className="device-control-header">
        <div>
          <strong>{device.name}</strong>
          <span>{deviceStatus(device, environmentTemperature)}</span>
        </div>
        <span className="control-chip">2D control</span>
      </div>

      {device.type === "light" && (
        <>
          <button className="control-button" onClick={() => onCommand({ type: "toggle-light-power" })}>
            {device.isOn ? "Turn Off" : "Turn On"}
          </button>
          <div className="mode-row">
            {lightModes.map((mode) => (
              <button
                key={mode.key}
                className={`mode-chip ${device.lightMode === mode.key ? "active" : ""}`}
                style={{ "--mode-color": mode.color }}
                onClick={() => onCommand({ type: "set-light-mode", mode: mode.key })}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="mini-copy">Current: {lightMode.label}</p>
          <p className="mini-copy">Double-click the light to toggle power directly on the plan.</p>
        </>
      )}

      {device.type === "window" && (
        <>
          <button className="control-button" onClick={() => onCommand({ type: "toggle-window" })}>
            {device.isOpen ? "Close Window" : "Open Window"}
          </button>
          <p className="mini-copy">Double-click the window to toggle it directly on the plan.</p>
        </>
      )}

      {device.type === "door" && (
        <>
          <button className="control-button" onClick={() => onCommand({ type: "toggle-door" })}>
            {device.isOpen ? "Close Door" : "Open Door"}
          </button>
          <p className="mini-copy">The hinge arc shows swing direction. Double-click the door for a quick toggle.</p>
        </>
      )}

      {device.type === "ac" && (
        <>
          <button className="control-button" onClick={() => onCommand({ type: "toggle-ac-power" })}>
            {device.isOn ? "Turn AC Off" : "Turn AC On"}
          </button>
          <div className="climate-row">
            <button
              className="control-button secondary"
              onClick={() => onCommand({ type: "set-ac-temperature", temperature: device.temperature - 1 })}
            >
              Cooler
            </button>
            <div className="temperature-readout">
              <strong>{formatTemperature(environmentTemperature)}</strong>
              <span>Current indoor temp</span>
              <small>Target {device.temperature}C</small>
            </div>
            <button
              className="control-button secondary"
              onClick={() => onCommand({ type: "set-ac-temperature", temperature: device.temperature + 1 })}
            >
              Warmer
            </button>
          </div>
          <p className="mini-copy">Double-click the AC for a quick power toggle.</p>
        </>
      )}

      {device.type === "tv" && (
        <>
          <button className="control-button" onClick={() => onCommand({ type: "toggle-tv" })}>
            {device.isOn ? "Turn TV Off" : "Turn TV On"}
          </button>
          <p className="mini-copy">Double-click the TV to switch screen power.</p>
        </>
      )}

      {device.type === "fridge" && (
        <>
          <button className="control-button" onClick={() => onCommand({ type: "toggle-fridge-door" })}>
            {device.isOpen ? "Close Door" : "Open Door"}
          </button>
          <div className="fridge-temp-row">
            <div className="fridge-temp-group">
              <span className="fridge-temp-label">Fridge</span>
              <div className="fridge-temp-controls">
                <button
                  className="control-button secondary small"
                  onClick={() => onCommand({ type: "set-fridge-temperature", fridgeTemperature: device.fridgeTemperature - 1 })}
                >
                  −
                </button>
                <strong>{device.fridgeTemperature}°C</strong>
                <button
                  className="control-button secondary small"
                  onClick={() => onCommand({ type: "set-fridge-temperature", fridgeTemperature: device.fridgeTemperature + 1 })}
                >
                  +
                </button>
              </div>
            </div>
            <div className="fridge-temp-group">
              <span className="fridge-temp-label">Freezer</span>
              <div className="fridge-temp-controls">
                <button
                  className="control-button secondary small"
                  onClick={() => onCommand({ type: "set-fridge-temperature", freezerTemperature: device.freezerTemperature - 1 })}
                >
                  −
                </button>
                <strong>{device.freezerTemperature}°C</strong>
                <button
                  className="control-button secondary small"
                  onClick={() => onCommand({ type: "set-fridge-temperature", freezerTemperature: device.freezerTemperature + 1 })}
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div className="fridge-inventory">
            <div className="fridge-inventory-section">
              <strong>Fridge ({(device.fridgeItems ?? []).length})</strong>
              {(device.fridgeItems ?? []).length === 0 && <span className="fridge-empty">Empty</span>}
              {(device.fridgeItems ?? []).map((item, idx) => (
                <div key={`f-${idx}`} className="fridge-item-row">
                  <span>{item.name} × {item.quantity} {item.unit}</span>
                  <button
                    className="fridge-item-remove"
                    onClick={() => onCommand({ type: "fridge-remove-item", compartment: "fridge", itemName: item.name })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="fridge-inventory-section">
              <strong>Freezer ({(device.freezerItems ?? []).length})</strong>
              {(device.freezerItems ?? []).length === 0 && <span className="fridge-empty">Empty</span>}
              {(device.freezerItems ?? []).map((item, idx) => (
                <div key={`z-${idx}`} className="fridge-item-row">
                  <span>{item.name} × {item.quantity} {item.unit}</span>
                  <button
                    className="fridge-item-remove"
                    onClick={() => onCommand({ type: "fridge-remove-item", compartment: "freezer", itemName: item.name })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          <p className="mini-copy">Double-click the fridge to toggle the door. Use the OpenClaw API to manage items.</p>
        </>
      )}

      {device.type === "robot" && (
        <>
          <div className="mode-row single">
            <button className={`control-button secondary ${robotRouteEditing ? "active" : ""}`} onClick={() => onCommand({ type: "toggle-route-editing" })}>
              {robotRouteEditing ? "Stop Route Edit" : "Edit Route"}
            </button>
            <button className={`control-button secondary ${device.loopRoute ? "active" : ""}`} onClick={() => onCommand({ type: "toggle-robot-loop" })}>
              Loop {device.loopRoute ? "On" : "Off"}
            </button>
          </div>
          <div className="mode-row single">
            <button className="control-button" onClick={() => onCommand({ type: "start-robot" })}>
              Start Route
            </button>
            <button className="control-button secondary" onClick={() => onCommand({ type: "pause-robot" })}>
              {device.status === "running" ? "Pause" : "Resume"}
            </button>
          </div>
          <button className="control-button danger" onClick={() => onCommand({ type: "clear-robot-route" })}>
            Clear Route
          </button>
          <p className="mini-copy">
            {device.route?.length ?? 0} waypoints • {device.loopRoute ? "looping" : "single pass"}
          </p>
          <p className="mini-copy">Double-click the robot to start or pause its route.</p>
        </>
      )}
    </div>
  );
}

function toolLabel(type) {
  return {
    light: "Light",
    window: "Window",
    door: "Door",
    ac: "AC",
    tv: "TV",
    fridge: "Fridge",
    robot: "Robot"
  }[type];
}

function deviceStatus(device, environmentTemperature = null) {
  if (device.type === "light") {
    const label = lightModes.find((mode) => mode.key === device.lightMode)?.label ?? "Light";
    return `${device.isOn ? "On" : "Off"} • ${label}`;
  }
  if (device.type === "window") {
    return device.isOpen ? "Open" : "Closed";
  }
  if (device.type === "door") {
    return device.isOpen ? "Open" : "Closed";
  }
  if (device.type === "ac") {
    const currentTemperature = environmentTemperature ?? device.temperature;
    return `${device.isOn ? "On" : "Off"} • ${formatTemperature(currentTemperature)} now • target ${device.temperature}C`;
  }
  if (device.type === "tv") {
    return device.isOn ? "On" : "Off";
  }
  if (device.type === "fridge") {
    const fridgeCount = (device.fridgeItems ?? []).length;
    const freezerCount = (device.freezerItems ?? []).length;
    return `${device.isOpen ? "Open" : "Closed"} • ${device.fridgeTemperature}°C/${device.freezerTemperature}°C • ${fridgeCount + freezerCount} items`;
  }
  return `${device.status} • ${device.route?.length ?? 0} points`;
}

function shouldRecordAction(action) {
  if (action.record === false) {
    return false;
  }

  return !["set-mode", "select-room", "select-device", "clear-selection", "robot-step", "climate-step", "set-simulation-time", "merge-remote-state"].includes(action.type);
}

function preserveUiState(nextState, currentState) {
  return {
    ...nextState,
    simulationTimeMinutes: currentState.simulationTimeMinutes,
    environmentTemperature: currentState.environmentTemperature,
    outdoorTemperature: currentState.outdoorTemperature,
    mode: currentState.mode,
    selectedRoomTemplate: currentState.selectedRoomTemplate,
    selectedDeviceTool: currentState.selectedDeviceTool
  };
}

function hasChanges(current, patch) {
  if (!current) {
    return true;
  }

  return Object.keys(patch).some((key) => current[key] !== patch[key]);
}

function humanizeMode(mode) {
  return mode
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function sameDocumentState(a, b) {
  return JSON.stringify({
    rooms: a.rooms,
    devices: a.devices
  }) ===
    JSON.stringify({
      rooms: b.rooms,
      devices: b.devices
    });
}

function mergeRemoteState(currentState, remoteState) {
  if (!remoteState) {
    return currentState;
  }

  const remoteDevicesById = new Map((remoteState.devices ?? []).map((device) => [device.id, device]));

  const devices = currentState.devices.map((device) => {
    const remoteDevice = remoteDevicesById.get(device.id);
    if (!remoteDevice) {
      return device;
    }

    return mergeRemoteDeviceState(device, remoteDevice);
  });

  return {
    ...currentState,
    devices,
    simulationTimeMinutes: remoteState.simulationTimeMinutes ?? currentState.simulationTimeMinutes,
    environmentTemperature: remoteState.environmentTemperature ?? currentState.environmentTemperature,
    outdoorTemperature: remoteState.outdoorTemperature ?? currentState.outdoorTemperature
  };
}

function mergeRemoteDeviceState(localDevice, remoteDevice) {
  if (localDevice.type === "light") {
    return {
      ...localDevice,
      isOn: remoteDevice.isOn,
      lightMode: remoteDevice.lightMode
    };
  }

  if (localDevice.type === "window" || localDevice.type === "door") {
    return {
      ...localDevice,
      isOpen: remoteDevice.isOpen
    };
  }

  if (localDevice.type === "ac") {
    return {
      ...localDevice,
      isOn: remoteDevice.isOn,
      temperature: remoteDevice.temperature
    };
  }

  if (localDevice.type === "tv") {
    return {
      ...localDevice,
      isOn: remoteDevice.isOn
    };
  }

  if (localDevice.type === "fridge") {
    return {
      ...localDevice,
      isOpen: remoteDevice.isOpen,
      fridgeTemperature: remoteDevice.fridgeTemperature,
      freezerTemperature: remoteDevice.freezerTemperature,
      fridgeItems: remoteDevice.fridgeItems ?? [],
      freezerItems: remoteDevice.freezerItems ?? []
    };
  }

  if (localDevice.type === "robot") {
    return {
      ...localDevice,
      status: remoteDevice.status,
      loopRoute: remoteDevice.loopRoute,
      route: remoteDevice.route ?? [],
      routeIndex: remoteDevice.routeIndex ?? 0,
      roomId: remoteDevice.roomId ?? localDevice.roomId,
      x: remoteDevice.x ?? localDevice.x,
      y: remoteDevice.y ?? localDevice.y
    };
  }

  return localDevice;
}

function getQuickActionCommand(device) {
  if (device.type === "light") {
    return { type: "toggle-light-power" };
  }
  if (device.type === "window") {
    return { type: "toggle-window" };
  }
  if (device.type === "door") {
    return { type: "toggle-door" };
  }
  if (device.type === "ac") {
    return { type: "toggle-ac-power" };
  }
  if (device.type === "tv") {
    return { type: "toggle-tv" };
  }
  if (device.type === "fridge") {
    return { type: "toggle-fridge-door" };
  }
  if (device.type === "robot" && device.route?.length) {
    return {
      type: device.status === "running" ? "pause-robot" : "start-robot"
    };
  }

  return null;
}

function getSvgPoint(event, svg) {
  const matrix = svg.getScreenCTM();
  if (matrix) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return clampPoint({ x: point.x, y: point.y });
  }

  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * planConfig.width;
  const y = ((event.clientY - rect.top) / rect.height) * planConfig.height;
  return clampPoint({ x, y });
}

function getDeviceCardPosition(device) {
  const xPercent = (device.x / planConfig.width) * 100;
  const yPercent = (device.y / planConfig.height) * 100;
  const alignRight = xPercent > 72;
  const alignBottom = yPercent > 72;

  return {
    left: `${xPercent}%`,
    top: `${yPercent}%`,
    transform: `translate(${alignRight ? "-104%" : "18px"}, ${alignBottom ? "-104%" : "18px"})`
  };
}

function clampTemperature(value) {
  return Math.max(16, Math.min(30, Math.round(value)));
}

function clampFridgeTemp(value) {
  return Math.max(1, Math.min(8, Math.round(value)));
}

function clampFreezerTemp(value) {
  return Math.max(-25, Math.min(-10, Math.round(value)));
}

function computeEnvironmentTemperature(state, deltaMs) {
  const seconds = deltaMs / 1000;
  const activeAcs = state.devices.filter((device) => device.type === "ac" && device.isOn);
  const openWindows = state.devices.filter((device) => device.type === "window" && device.isOpen);

  let next = state.environmentTemperature;
  const ambientStrength = Math.min(0.04, 0.012 * seconds);
  next += (state.outdoorTemperature - next) * ambientStrength;

  if (activeAcs.length > 0) {
    const averageTarget =
      activeAcs.reduce((sum, device) => sum + device.temperature, 0) / activeAcs.length;
    const acStrength = Math.min(0.22, activeAcs.length * 0.12 * seconds);
    next += (averageTarget - next) * acStrength;
  }

  if (openWindows.length > 0) {
    const windowStrength = Math.min(0.12, openWindows.length * 0.045 * seconds);
    next += (state.outdoorTemperature - next) * windowStrength;
  }

  return roundTemperature(next);
}

function roundTemperature(value) {
  return Math.round(value * 10) / 10;
}

function formatTemperature(value) {
  return `${roundTemperature(value).toFixed(1)}C`;
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
  const wrapped = ((numericMinutes % 1440) + 1440) % 1440;
  return wrapped;
}

function formatTimeLabel(minutes, includeSeconds = false) {
  const normalized = normalizeTimeMinutes(minutes);
  const hours = Math.floor(normalized / 60);
  const mins = Math.floor(normalized % 60);
  const secs = Math.floor((normalized * 60) % 60);

  if (includeSeconds) {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export default App;
