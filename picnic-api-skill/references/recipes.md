# Recipe Endpoints

Quick reference for all recipe endpoints — searching, browsing, recommendations,
and user-defined recipes.

---

## Searching

### hackathon-search-recipes (GET)

**Params:** `query` (string, required), `limit` (number, default 20)

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Echo of the search query |
| `recipes[]` | Recipe[] | See Recipe shape below |
| `total` | number | Length of recipes |

---

## Getting Details

### hackathon-get-recipe (GET)

**Params:** `id` (string, required — the recipe/sellable ID)

**Response:** Single Recipe object (see shape below).

### hackathon-get-recipes (GET)

Batch get multiple recipes at once.

**Params:** `ids` (string[], required — pass as `?ids=a&ids=b`)

---

## Recommendations

### hackathon-get-recipe-recommendations (GET)

Returns personalized recommendations (main courses, <=30 min prep).

**Params:** `limit` (number, default 10)

---

## User-Defined Recipes

### hackathon-save-user-defined-recipe (POST)

**Payload:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | yes | string | Recipe name |
| `portions` | yes | number | Number of portions |
| `selling_units` | yes | string[] | Array of selling unit IDs |
| `selling_unit_quantities_by_id` | yes | object | `{ [id]: number }` |
| `selling_unit_sources` | yes | object | `{ [id]: "search" }` |
| `note` | no | string | Preparation instructions |

### hackathon-update-user-defined-recipe (POST)

**Payload:** `selling_group_id` (required), `name`, `portions`, `note` (all optional)

### hackathon-delete-user-defined-recipe (POST)

**Payload:** `sellable_id` (string, required)

---

## Recipe shape

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Recipe/sellable ID |
| `name` | string | Recipe display name |
| `creator` | object | `{ type: "PIM" \| "USER" }` |
| `ingredients` | Ingredient[]? | `null` for user-defined recipes |
| `meal_characteristics` | object? | `{ course?, kitchen?, protein?, ... }` |
| `portions` | number | Portion count |
| `preparation_time` | object? | `{ preparation_time: string }` |

### Ingredient shape

| Field | Type | Description |
|-------|------|-------------|
| `ingredient_id` | string | Ingredient identifier |
| `ingredient_type` | string | `"CORE"`, `"COMPLEMENTARY"`, `"CUPBOARD"`, etc. |
| `name` | string | Ingredient display name |
| `selling_unit_id` | string? | Product ID, null if no match |
| `selling_unit_quantity` | number | Quantity needed |
| `availability_status` | string | `"AVAILABLE"` etc. |
| `display_ingredient_quantity` | number? | e.g. `400` for 400g |
| `display_unit_of_measurement` | string? | e.g. `"g"`, `"ml"` |
