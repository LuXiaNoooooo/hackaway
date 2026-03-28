# Shopping Endpoints

Quick reference for all product, cart, category, favorite, delivery, and order
endpoints.

**Type conventions:**
- Prices are **integer cents** (divide by 100 for EUR)
- IDs are **strings**
- Timestamps are **epoch milliseconds**

---

## Products

### hackathon-search-products (GET)

**Params:** `query` (string, required), `limit` (number, default 20)

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Echo of the search query |
| `results[]` | Product[] | See Product shape below |
| `total` | number | Length of results |

### hackathon-get-product (GET)

**Params:** `selling_unit_id` (string, required)

### hackathon-get-product-alternatives (GET)

**Params:** `selling_unit_id` (string, required)

### hackathon-search-suggestions (GET)

**Params:** `query` (string, required)

### Product shape

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Selling unit ID (e.g. `"s1132274"`) |
| `availability` | string | `"AVAILABLE"` or `"LONG_TERM_UNAVAILABLE"` |
| `brand` | string? | Brand name |
| `characteristics` | object? | Flags: `organic`, `frozen`, `bbq`, etc. |
| `discount_price` | number? | Discounted price in cents |
| `image_url` | string | Image hash |
| `name` | string | Product display name |
| `price` | number? | Unit price in cents |
| `temperature_zone` | string | e.g. `"chilled"`, `"ambient"` |
| `unit_quantity` | string? | e.g. `"1 liter"`, `"500 g"` |

---

## Cart

### hackathon-get-cart (GET)

**Params:** None

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `items[]` | CartItem[] | See shape below |
| `total_items` | number | Sum of all item quantities |
| `total_price` | number | Total in cents |

### hackathon-add-to-cart (POST)

**Payload:** `selling_unit_id` (string, required), `count` (number, required, >= 1)

### hackathon-remove-from-cart (POST)

**Payload:** `selling_unit_id` (string, required), `count` (number, optional)

### hackathon-clear-cart (POST)

**Payload:** None (empty `{}`)

### CartItem shape

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Selling unit ID |
| `availability` | string | Status |
| `discount_price` | number? | Discounted price in cents |
| `name` | string | Product display name |
| `price` | number | Unit price in cents |
| `quantity` | number | Units in cart |
| `unit_quantity` | string? | e.g. `"1 liter"` |

---

## Categories

### hackathon-list-categories (GET)

**Params:** `limit` (default 50), `offset` (default 0)

### hackathon-get-subcategories (GET)

**Params:** `category_id` (string, required)

---

## Favorites

### hackathon-list-favorites (GET)

**Params:** `limit` (default 50), `offset` (default 0)

### hackathon-toggle-favorite (POST)

**Payload:** `selling_unit_id`, `status` (`"LIKE"` or `"UNLIKE"`)

---

## Delivery Slots

### hackathon-get-delivery-slots (GET)

**Params:** None

### hackathon-get-selected-delivery-slot (GET)

**Params:** None

### set_delivery_slot (direct REST call)

```bash
curl -s -X POST "https://storefront-prod.nl.picnicinternational.com/api/15/cart/set_delivery_slot" \
  -H "Content-Type: application/json" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001" \
  -d '{"slot_id": "<slot_id>"}'
```

### Slot shape

| Field | Type | Description |
|-------|------|-------------|
| `slot_id` | string | Slot identifier |
| `window_start` | number | Epoch ms |
| `window_end` | number | Epoch ms |
| `cut_off_time` | number | Latest order time |
| `is_available` | boolean | Can be selected |
| `selected` | boolean | Currently active |
| `minimum_order_value` | number | Min cart total in cents |

---

## Orders

### hackathon-list-orders (GET)

**Params:** `limit` (default 20), `offset` (default 0)

### hackathon-get-order (GET)

**Params:** `delivery_id` (string, required)

### OrderItem shape

| Field | Type |
|-------|------|
| `selling_unit_id` | string |
| `name` | string |
| `price` | number |
| `quantity` | number |
