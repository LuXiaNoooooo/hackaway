# Demo Voiceover Script

## Opening

Hi everyone, today I want to show you a smarter way to control a home.

What we built is not just another dashboard for individual devices. It is a room-aware home console connected to OpenClaw. The key idea is simple: instead of treating lights, windows, climate, and the robot as isolated controls, we treat the whole home as one spatial system with one shared state.

That lets us go from a natural sentence like, "I just cooked and I want to rest," to a complete multi-step action plan that is still visible, verifiable, and easy to explain.

## Slide 1: What This Project Is

At a high level, this project combines three things.

First, we have a 2D home console where users can see rooms, place devices, and understand the state of the home visually.

Second, we have a semantic control API. Instead of forcing every action to be device-by-device, the API can target an entire room, multiple rooms, or a full capability group like all lights or all windows.

Third, we have the OpenClaw layer. OpenClaw reads the current home state, reasons over user intent, builds the right action chain, and executes it in one batch.

## Slide 2: Technical Stack

On the frontend side, the product is built with React and Vite, with a 2D floorplan interaction model.

Under that, we keep a single home state model. That state includes rooms, devices, time, temperature, and robot behavior. So the UI, the simulation, and the automation layer are all reading from the same source of truth.

Then we expose capability-based APIs for lights, windows, doors, climate, TV, and robot actions. And on top of that, we give OpenClaw a formal skill document and playbooks, so it does not have to guess how the system works.

## Slide 3: Core Product Capabilities

There are a few things that make this system practical.

The first is spatial control. Users are not looking at a flat list of smart devices. They are looking at a home map.

The second is visible state feedback. We can show light modes, whether windows are open, what the indoor temperature is, what time it is, and whether the robot is running.

The third is semantic control. We can say things like "turn off all lights," "set the bedroom to night mode," or "clean the kitchen," and the system knows how to translate that into specific API actions.

## Slide 4: How OpenClaw Connects

This is where the system becomes much more powerful than a traditional smart home routine.

OpenClaw starts by reading the latest home state. That means it sees the actual rooms, the actual devices, and their current condition.

Then it reasons over the user request. It decides what the outcome should be, not just which single device to toggle.

After that, it builds one ordered batch request. The batch API executes the whole chain and returns the final home state. That final step is important, because now OpenClaw can verify what really happened and explain it back clearly.

## Slide 5: Why This Is Better Than Traditional Smart Home Flows

For simple tasks, tools like HomeKit, Alexa, and Google Home are convenient. But for complex room-level behavior, they are usually limited.

They tend to be device-first, vendor-first, or scene-first. In other words, they are good at preset commands, but not as strong at reasoning over live room context, current state, and multi-step intent.

Our system is stronger for this use case because it is agentic, inspectable, and spatial. OpenClaw can understand the home as a layout, plan across multiple capabilities, and execute a full scene in one call with visible results.

That gives us more flexibility, better debugging, and a much more natural user experience.

## Slide 6: Demo Overview

Now I want to show the live demo in four parts.

First, I will introduce the frontend itself so you can see how rooms and devices are represented.

Then I will show three core user stories:

one, after cooking, the user wants to rest;

two, the user leaves home;

and three, the user wants to watch TV.

Each one will show how OpenClaw turns natural language into coordinated actions across the house.

## Demo Part 1: Frontend Tour

Let's start with the console.

Here we can see the floorplan in 2D. Each room is explicit, and each device is placed in context. Lights, windows, doors, TV, AC, and the robot all live on the same map.

What matters here is clarity. The user can immediately understand what exists, where it is, and what state it is in. That makes the home easier to control, and it also makes OpenClaw's decisions easier to explain.

## Demo Part 2: "I just cooked and I want to rest."

Now I'll give OpenClaw the first command:

"I just cooked and I want to rest."

OpenClaw reads the current state, recognizes that this is a kitchen-to-bedroom transition, and builds the right scene.

The robot starts cleaning the kitchen. All lights go off, except the bedroom, which switches into night mode. Windows close. The climate moves into a sleep-friendly setting.

What is important is that this is not one hardcoded button. It is a room-aware plan assembled from the user's intent.

## Demo Part 3: "I'm leaving home."

For the second scenario, I tell OpenClaw:

"I'm leaving home."

Now the system shifts into an away-state routine.

Lights go off. TV and climate shut down. Doors and windows close. And the robot starts a whole-home clean.

This is a good example of why batch execution matters. Instead of separate actions firing in a messy way, we can execute one ordered chain and get one final verified state back.

## Demo Part 4: "I'm going to watch TV."

For the last scenario, I say:

"I'm going to watch TV."

OpenClaw understands that this is not just about turning on a screen. It is about creating the right environment.

So the robot stops, the rest of the home gets darker, the TV room lights shift into a cozy mode, and climate moves into a comfort setting.

This is the kind of ambient, context-aware behavior that feels much closer to an intelligent home operating layer than a traditional voice command system.

## Closing

To wrap up, the key value of this project is not just that we can control smart devices.

The real value is that we can model the home spatially, expose it through a clean capability-based API, and let OpenClaw reason over it in a transparent and verifiable way.

That is what makes the experience more flexible than classic smart home platforms, and that is also what makes it much easier to extend from a demo system into a real home automation product.
