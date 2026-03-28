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

## Playbook: "What do I need to buy from Picnic?"

Intent:
- Check fridge and freezer contents
- Identify items running low or missing from usual staples
- Suggest a Picnic shopping list

Discovery step:
1. Read `GET /api/home/state`
2. Find the fridge device in `state.devices` (type: "fridge")
3. Read `fridgeItems` and `freezerItems`
4. Compare against a standard household staple list or user preferences

Example fridge state after reading:
```json
{
  "fridgeItems": [
    { "name": "Whole Milk", "quantity": 1, "unit": "L" },
    { "name": "Gouda Cheese", "quantity": 1, "unit": "pack" }
  ],
  "freezerItems": [
    { "name": "Frozen Pizza", "quantity": 2, "unit": "pcs" }
  ]
}
```

Suggested agent response:
- "You have milk and cheese in the fridge, plus frozen pizza. You might want to restock eggs, butter, yogurt, and vegetables."
- Then use the Picnic API to search and add missing items to the cart.

## Playbook: "I just got groceries, update the fridge"

Intent:
- Add delivered items to fridge and freezer inventory

Recommended batch:
```json
{
  "continueOnError": false,
  "actions": [
    {
      "path": "/api/devices/fridge/items",
      "body": {
        "id": "device-fridge-kitchen",
        "action": "add",
        "compartment": "fridge",
        "item": { "name": "Whole Milk", "quantity": 2, "unit": "L" }
      }
    },
    {
      "path": "/api/devices/fridge/items",
      "body": {
        "id": "device-fridge-kitchen",
        "action": "add",
        "compartment": "fridge",
        "item": { "name": "Free-Range Eggs", "quantity": 12, "unit": "pcs" }
      }
    },
    {
      "path": "/api/devices/fridge/items",
      "body": {
        "id": "device-fridge-kitchen",
        "action": "add",
        "compartment": "freezer",
        "item": { "name": "Ice Cream", "quantity": 1, "unit": "tub" }
      }
    }
  ]
}
```

## Playbook: "I used eggs for dinner"

Intent:
- Remove or reduce used items from the fridge

Single action:
```json
{
  "path": "/api/devices/fridge/items",
  "body": {
    "id": "device-fridge-kitchen",
    "action": "remove",
    "compartment": "fridge",
    "itemName": "Free-Range Eggs",
    "quantity": 4
  }
}
```

## Playbook: "补全冰箱我要做博洛尼亚意大利面" (Restock fridge for Bolognese pasta)

Intent:
- Find the recipe for Bolognese pasta
- Check what's already in the fridge
- Search for missing ingredients on Picnic
- Add missing items to the Picnic cart
- Update fridge with incoming items

### Step-by-step execution:

**1. Authenticate with Picnic (if `/tmp/picnic-token` doesn't exist or is stale):**

```bash
AUTH_TOKEN=$(curl -s -D - -o /dev/null \
  -H "Content-Type: application/json" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001" \
  -d '{"key": "picnic-22@hackaway.com", "password": "123456", "client_id": 30100}' \
  "https://storefront-prod.nl.picnicinternational.com/api/15/user/login" \
  | grep -i "x-picnic-auth" | awk '{ gsub(/,/, ""); print $2 }' | tr -d '\r\n')
echo -n "$AUTH_TOKEN" > /tmp/picnic-token
echo "Done! Token length: ${#AUTH_TOKEN}"
```

**2. Read fridge state:**

```bash
curl -s http://127.0.0.1:5173/api/home/state | python3 -c "
import sys, json
state = json.load(sys.stdin)['state']
fridge = next((d for d in state['devices'] if d['type'] == 'fridge'), None)
if fridge:
    print('=== Fridge Items ===')
    for item in fridge.get('fridgeItems', []):
        print(f\"  {item['name']} x{item['quantity']} {item.get('unit','')}\")
    print('=== Freezer Items ===')
    for item in fridge.get('freezerItems', []):
        print(f\"  {item['name']} x{item['quantity']} {item.get('unit','')}\")
"
```

**3. Search for Bolognese recipe on Picnic:**

```bash
curl -s -X GET "https://storefront-prod.nl.picnicinternational.com/api/15/pages/hackathon-search-recipes?query=bolognese&limit=5" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001"
```

If a recipe is found, get full details:
```bash
curl -s -X GET "https://storefront-prod.nl.picnicinternational.com/api/15/pages/hackathon-get-recipe?id=RECIPE_ID" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001"
```

If no Picnic recipe found, use general knowledge. Bolognese pasta typically needs:
- Spaghetti or pasta (500g)
- Ground beef / rundergehakt (500g)
- Onion / ui (2 pcs)
- Garlic / knoflook (3 cloves)
- Canned tomatoes / tomatenblokjes (400g)
- Tomato paste / tomatenpuree (70g)
- Carrot / wortel (1)
- Celery / selderij (1 stalk)
- Olive oil / olijfolie
- Parmesan cheese / Parmezaanse kaas
- Salt, pepper, oregano, basil

**4. For each missing ingredient, search and add to cart:**

```bash
# Example: search for ground beef
curl -s -X GET "https://storefront-prod.nl.picnicinternational.com/api/15/pages/hackathon-search-products?query=rundergehakt&limit=3" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001"

# Add the best match to cart (use actual selling_unit_id from search result)
curl -s -X POST "https://storefront-prod.nl.picnicinternational.com/api/15/pages/task/hackathon-add-to-cart" \
  -H "Content-Type: application/json" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001" \
  -d '{"payload": {"selling_unit_id": "ACTUAL_ID", "count": 1}}'
```

**5. Update fridge inventory with purchased items:**

```json
{
  "continueOnError": false,
  "actions": [
    {
      "path": "/api/devices/fridge/items",
      "body": {
        "id": "device-fridge-kitchen",
        "action": "add",
        "compartment": "fridge",
        "item": { "name": "Ground Beef", "quantity": 1, "unit": "500g" }
      }
    },
    {
      "path": "/api/devices/fridge/items",
      "body": {
        "id": "device-fridge-kitchen",
        "action": "add",
        "compartment": "fridge",
        "item": { "name": "Onion", "quantity": 2, "unit": "pcs" }
      }
    },
    {
      "path": "/api/devices/fridge/items",
      "body": {
        "id": "device-fridge-kitchen",
        "action": "add",
        "compartment": "fridge",
        "item": { "name": "Parmesan", "quantity": 1, "unit": "pack" }
      }
    }
  ]
}
```

**6. Report to user:**

Summarize:
- Recipe: Spaghetti Bolognese (4 servings)
- Already in fridge: Butter, Cheese (can sub for Parmesan)
- Added to Picnic cart: Ground beef (€4.29), Spaghetti (€1.19), Onions (€0.99), ...
- Total estimated: €12.50
- Fridge updated with incoming items

### Search tips for Dutch products:

Use Dutch product names for better Picnic search results:
- Ground beef → `rundergehakt` or `gehakt`
- Onion → `ui` or `uien`
- Garlic → `knoflook`
- Canned tomatoes → `tomatenblokjes` or `gepelde tomaten`
- Tomato paste → `tomatenpuree`
- Spaghetti → `spaghetti`
- Parmesan → `parmezaan` or `Parmigiano`
- Olive oil → `olijfolie`
- Carrot → `wortel` or `wortelen`
- Celery → `selderij`

## Planning Heuristics

When translating user language to actions:
- “Rest”, “sleep”, “night” -> use `light/mode = night` and `climate/preset = sleep`
- “Comfortable”, “watch TV”, “relax” -> use `light/mode = cozy` and `climate/preset = comfort`
- “Leave home”, “away”, “going out” -> prefer powered devices off, windows closed, doors closed, optional `climate/preset = away`
- "What's in the fridge?", "check fridge" -> read state, list fridgeItems and freezerItems
- "Add X to fridge" -> use fridge/items with action "add"
- "I used X", "remove X" -> use fridge/items with action "remove"
- "Make fridge colder" -> decrease fridgeTemperature
- "What should I buy?", "shopping list" -> compare fridge contents against staples, suggest Picnic search
- "补全冰箱我要做X", "restock fridge for X" -> authenticate Picnic, search recipe, compare fridge, add missing to cart, update fridge
- "I want to cook X" -> same as restock workflow above

## Failure Handling

Prefer this order:
1. Read current state
2. Use `optional: true` where hardware may be absent
3. Use `continueOnError: false` unless the task is explicitly best-effort
4. Inspect the final `state` returned by the batch before telling the user what happened
