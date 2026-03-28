import { useEffect, useState } from "react";

type Metric = {
  label: string;
  value: string;
  detail: string;
};

type StackLayer = {
  title: string;
  summary: string;
  bullets: string[];
};

type Capability = {
  title: string;
  summary: string;
};

type FlowStep = {
  label: string;
  summary: string;
};

type Advantage = {
  traditional: string;
  ours: string;
};

type DemoScene = {
  title: string;
  setup: string;
  outcome: string;
};

const metrics: Metric[] = [
  {
    label: "Interaction Model",
    value: "2D-first",
    detail: "CAD-like editing, room semantics, and device state visibility."
  },
  {
    label: "Control Layer",
    value: "Batch API",
    detail: "One request can execute a full scene and return the final state."
  },
  {
    label: "Robot Control",
    value: "Room-aware",
    detail: "OpenClaw asks for cleaning intent, not geometry coordinates."
  },
  {
    label: "Agent Interface",
    value: "Skill-driven",
    detail: "OpenClaw gets explicit rules, payloads, and ready-made playbooks."
  }
];

const stackLayers: StackLayer[] = [
  {
    title: "Presentation Layer",
    summary: "React + Vite frontends for the home console and this slide deck.",
    bullets: [
      "2D floorplan editor with direct device interaction",
      "English-first product presentation for pitch and demo flow",
      "Fast iteration using a lightweight Vite stack"
    ]
  },
  {
    title: "Home Simulation Layer",
    summary: "A single room-and-device state model powers the UI, automation, and demo realism.",
    bullets: [
      "Connected rooms, device placement, and visual state feedback",
      "Indoor and outdoor temperature simulation",
      "Clock-driven behavior and robot route execution"
    ]
  },
  {
    title: "Control API Layer",
    summary: "Capability-based APIs keep the system readable, inspectable, and easy to orchestrate.",
    bullets: [
      "Lights, windows, doors, TVs, climate, and robot endpoints",
      "Bulk selection by room, ids, or full capability groups",
      "Ordered batch execution with per-step results"
    ]
  },
  {
    title: "OpenClaw Layer",
    summary: "OpenClaw reads state, reasons over room context, builds plans, and executes one scene request.",
    bullets: [
      "Skill document defines rules, selectors, and payload shapes",
      "Playbooks translate natural language into room-aware action chains",
      "The final state comes back for verification and narration"
    ]
  }
];

const capabilities: Capability[] = [
  {
    title: "Editable spatial model",
    summary: "Users draw rooms, place devices, and see the actual home layout instead of flat device lists."
  },
  {
    title: "Visual state feedback",
    summary: "Light modes, doors, windows, AC temperature, time, and robot status are visible directly on the map."
  },
  {
    title: "Semantic device control",
    summary: "The API can target one device, one room, multiple rooms, or an entire capability group."
  },
  {
    title: "Robot cleaning by intent",
    summary: "The system accepts room-level cleaning goals and generates the path automatically."
  },
  {
    title: "Scene execution in one call",
    summary: "Multi-step routines can be sent through /api/actions/batch and verified through the returned state."
  },
  {
    title: "Agent-ready docs",
    summary: "OpenClaw gets a formal skill, API reference, and playbooks instead of reverse-engineering behavior."
  }
];

const flowSteps: FlowStep[] = [
  {
    label: "1. Read",
    summary: "OpenClaw calls GET /api/home/state to learn rooms, devices, and current conditions."
  },
  {
    label: "2. Reason",
    summary: "It maps user intent to room-aware outcomes like sleep mode, whole-home shutdown, or TV mode."
  },
  {
    label: "3. Plan",
    summary: "It builds ordered API actions, usually as one POST /api/actions/batch payload."
  },
  {
    label: "4. Execute",
    summary: "The console applies each action and returns per-step results plus the final home state."
  },
  {
    label: "5. Verify",
    summary: "OpenClaw explains what changed using returned state instead of guessing."
  }
];

const advantages: Advantage[] = [
  {
    traditional: "Traditional smart home tools mostly trigger devices one by one or rely on fixed scenes.",
    ours: "Our system handles room semantics, multi-step planning, and one-call orchestration for the entire home."
  },
  {
    traditional: "HomeKit, Alexa, and Google Home are usually bounded by vendor integrations and shallow automation logic.",
    ours: "OpenClaw can reason across space, device state, and user intent, then compose exactly the actions we need."
  },
  {
    traditional: "Robot cleaning often requires separate apps or manual route setup.",
    ours: "Robot cleaning is part of the same state model and can be triggered by room intent like clean the kitchen."
  },
  {
    traditional: "Users often cannot inspect why a routine did or did not work.",
    ours: "Every command returns explicit results and the final state, which makes debugging and narration far cleaner."
  }
];

const demoScenes: DemoScene[] = [
  {
    title: "Frontend tour",
    setup: "We begin by showing the 2D home console: rooms, devices, live visual states, time, temperature, and robot feedback.",
    outcome: "The audience immediately sees that this is a spatial control surface, not a generic device dashboard."
  },
  {
    title: "After cooking, I want to rest",
    setup: "OpenClaw cleans the kitchen, turns off all lights, keeps the bedroom in night mode, closes windows, and moves climate into sleep comfort.",
    outcome: "This demonstrates room-aware reasoning and a scene that spans multiple device types in one flow."
  },
  {
    title: "I am leaving home",
    setup: "OpenClaw powers down the home, closes doors and windows, and starts whole-home robot cleaning.",
    outcome: "This shows home-wide orchestration with clear safety and energy behavior."
  },
  {
    title: "I am going to watch TV",
    setup: "OpenClaw stops the robot, darkens the rest of the house, keeps the TV room cozy, and adjusts climate for comfort.",
    outcome: "This highlights intent-based ambience instead of device-by-device tapping."
  }
];

const slideCount = 7;

function clampIndex(index: number) {
  if (index < 0) {
    return 0;
  }
  if (index >= slideCount) {
    return slideCount - 1;
  }
  return index;
}

function App() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        setActiveIndex((current) => clampIndex(current + 1));
      }

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setActiveIndex((current) => clampIndex(current - 1));
      }

      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      }

      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(slideCount - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="deck-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="deck-header">
        <div>
          <p className="deck-eyebrow">Hackaway Home Console</p>
          <h1 className="deck-title">OpenClaw Product Story</h1>
        </div>
        <div className="deck-controls">
          <span className="deck-hint">Use arrow keys</span>
          <button
            className="nav-button"
            onClick={() => setActiveIndex((current) => clampIndex(current - 1))}
            type="button"
          >
            Prev
          </button>
          <button
            className="nav-button primary"
            onClick={() => setActiveIndex((current) => clampIndex(current + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </header>

      <main className="deck-stage">
        <div
          className="slides-track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          <section className="slide">
            <div className="slide-content">
              <p className="slide-label">Slide 01</p>
              <div className="hero-grid">
                <div>
                  <p className="slide-kicker">Agentic home control</p>
                  <h2 className="slide-headline">A smart home system that thinks in rooms, not just devices.</h2>
                  <p className="slide-copy">
                    Hackaway combines a spatial 2D control console, a semantic control API, and an
                    OpenClaw skill layer so one natural-language request can orchestrate the whole
                    environment.
                  </p>
                </div>
                <div className="hero-card">
                  {metrics.map((metric) => (
                    <article className="metric-card" key={metric.label}>
                      <p className="metric-label">{metric.label}</p>
                      <h3 className="metric-value">{metric.value}</h3>
                      <p className="metric-detail">{metric.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="slide">
            <div className="slide-content">
              <p className="slide-label">Slide 02</p>
              <h2 className="slide-headline">Full stack, one state model.</h2>
              <p className="slide-copy narrow">
                Every layer reads the same spatial truth: rooms, devices, time, temperature, and
                robot motion all live in one model that can be edited, inspected, and controlled.
              </p>
              <div className="stack-grid">
                {stackLayers.map((layer) => (
                  <article className="glass-card" key={layer.title}>
                    <p className="card-kicker">{layer.title}</p>
                    <h3 className="card-title">{layer.summary}</h3>
                    <ul className="card-list">
                      {layer.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="slide">
            <div className="slide-content">
              <p className="slide-label">Slide 03</p>
              <h2 className="slide-headline">Core product capabilities.</h2>
              <div className="capability-grid">
                {capabilities.map((capability) => (
                  <article className="capability-card" key={capability.title}>
                    <h3>{capability.title}</h3>
                    <p>{capability.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="slide">
            <div className="slide-content">
              <p className="slide-label">Slide 04</p>
              <div className="two-column">
                <div>
                  <p className="slide-kicker">OpenClaw integration</p>
                  <h2 className="slide-headline">The bridge is explicit, inspectable, and agent-friendly.</h2>
                  <p className="slide-copy">
                    OpenClaw does not guess. It reads the latest home state, reasons over room
                    context, builds a scene plan, executes it through the new batch API, and gets
                    back the verified end state.
                  </p>
                  <div className="code-panel">
                    <p>Example control surface</p>
                    <code>GET /api/home/state</code>
                    <code>POST /api/devices/robot/clean</code>
                    <code>POST /api/devices/climate/preset</code>
                    <code>POST /api/actions/batch</code>
                  </div>
                </div>
                <div className="flow-rail">
                  {flowSteps.map((step) => (
                    <article className="flow-card" key={step.label}>
                      <p className="flow-label">{step.label}</p>
                      <p className="flow-copy">{step.summary}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="slide">
            <div className="slide-content">
              <p className="slide-label">Slide 05</p>
              <h2 className="slide-headline">Why this is stronger than traditional smart home flows.</h2>
              <p className="slide-copy narrow">
                For complex room-level automation, our system is more expressive and more transparent
                than standard voice-assistant scenes.
              </p>
              <div className="comparison-grid">
                {advantages.map((advantage, index) => (
                  <article className="comparison-card" key={index}>
                    <div>
                      <p className="comparison-label muted">Traditional</p>
                      <p>{advantage.traditional}</p>
                    </div>
                    <div>
                      <p className="comparison-label">Hackaway + OpenClaw</p>
                      <p>{advantage.ours}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="slide">
            <div className="slide-content">
              <p className="slide-label">Slide 06</p>
              <h2 className="slide-headline">Demo structure.</h2>
              <div className="demo-grid">
                {demoScenes.map((scene) => (
                  <article className="demo-card" key={scene.title}>
                    <p className="card-kicker">{scene.title}</p>
                    <h3 className="card-title">{scene.setup}</h3>
                    <p className="demo-outcome">{scene.outcome}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="slide">
            <div className="slide-content">
              <p className="slide-label">Slide 07</p>
              <div className="closing-shell">
                <p className="slide-kicker">Closing message</p>
                <h2 className="slide-headline">One console. One agent. One verifiable home state.</h2>
                <p className="slide-copy narrow">
                  The result is a system that feels more like an intelligent operating layer for the
                  home than a collection of isolated smart devices. The final step is swapping the
                  mock bridge for a live OpenClaw or MCP runtime.
                </p>
                <div className="closing-bar">
                  <span>Spatial UI</span>
                  <span>Semantic API</span>
                  <span>OpenClaw Skill</span>
                  <span>Live Demo Ready</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <aside className="slide-dots">
        {Array.from({ length: slideCount }, (_, index) => (
          <button
            aria-label={`Go to slide ${index + 1}`}
            className={index === activeIndex ? "dot active" : "dot"}
            key={index}
            onClick={() => setActiveIndex(index)}
            type="button"
          />
        ))}
      </aside>
    </div>
  );
}

export default App;
