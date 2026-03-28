export const planConfig = {
  width: 960,
  height: 720,
  grid: 20
};

export const roomTemplates = [
  { key: "living", label: "Living Room", color: "#dbeafe" },
  { key: "kitchen", label: "Kitchen", color: "#fef3c7" },
  { key: "bedroom", label: "Bedroom", color: "#ede9fe" },
  { key: "studio", label: "Studio", color: "#dcfce7" }
];

export const deviceTemplates = [
  { key: "light", label: "Add Light", hint: "Click inside a room to place a light." },
  { key: "window", label: "Add Window", hint: "Click anywhere inside a room. The window snaps to the nearest wall." },
  { key: "door", label: "Add Door", hint: "Click anywhere inside a room. The door snaps to the nearest wall." },
  { key: "ac", label: "Add AC", hint: "Click anywhere inside a room. The AC unit mounts to the nearest wall." },
  { key: "tv", label: "Add TV", hint: "Click anywhere inside a room. The TV mounts to the nearest wall." },
  { key: "robot", label: "Place Robot", hint: "Click inside a room to place or move the robot." }
];

export const lightModes = [
  { key: "cozy", label: "Cozy", color: "#f59e0b", kelvin: 2700 },
  { key: "focus", label: "Focus", color: "#facc15", kelvin: 3500 },
  { key: "daylight", label: "Daylight", color: "#38bdf8", kelvin: 5200 },
  { key: "night", label: "Night", color: "#818cf8", kelvin: 2100 }
];

export const initialRooms = [
  {
    id: "room-living",
    kind: "living",
    name: "Living Room",
    color: "#dbeafe",
    x: 140,
    y: 140,
    width: 320,
    height: 220
  },
  {
    id: "room-kitchen",
    kind: "kitchen",
    name: "Kitchen",
    color: "#fef3c7",
    x: 460,
    y: 140,
    width: 180,
    height: 160
  },
  {
    id: "room-bedroom",
    kind: "bedroom",
    name: "Bedroom",
    color: "#ede9fe",
    x: 140,
    y: 360,
    width: 240,
    height: 180
  },
  {
    id: "room-studio",
    kind: "studio",
    name: "Studio",
    color: "#dcfce7",
    x: 380,
    y: 360,
    width: 260,
    height: 180
  }
];

export const initialDevices = [
  {
    id: "device-light-main",
    type: "light",
    name: "Main Pendant",
    roomId: "room-living",
    x: 298,
    y: 238,
    isOn: true,
    lightMode: "cozy"
  },
  {
    id: "device-window-living",
    type: "window",
    name: "Panoramic Window",
    roomId: "room-living",
    x: 450,
    y: 196,
    wall: "east",
    isOpen: true
  },
  {
    id: "device-door-entry",
    type: "door",
    name: "Entry Door",
    roomId: "room-living",
    x: 140,
    y: 308,
    wall: "west",
    isOpen: false
  },
  {
    id: "device-tv-living",
    type: "tv",
    name: "Media Screen",
    roomId: "room-living",
    x: 432,
    y: 282,
    wall: "east",
    isOn: true
  },
  {
    id: "device-ac-bedroom",
    type: "ac",
    name: "Bedroom AC",
    roomId: "room-bedroom",
    x: 260,
    y: 360,
    wall: "north",
    isOn: true,
    temperature: 24
  },
  {
    id: "device-robot",
    type: "robot",
    name: "Vacuum Robot",
    roomId: "room-living",
    x: 250,
    y: 312,
    status: "idle",
    battery: 82,
    loopRoute: true,
    routeIndex: 0,
    route: [
      { x: 250, y: 312 },
      { x: 370, y: 312 },
      { x: 370, y: 220 },
      { x: 250, y: 220 }
    ]
  }
];
