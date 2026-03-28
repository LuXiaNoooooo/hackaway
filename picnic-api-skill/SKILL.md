---
name: picnic-api-skill
description: >-
 Interacts with the Picnic grocery delivery API for hackathon projects. Handles
 authentication, product search, cart management, favorites, orders, delivery
 slots, and recipes. Activates when users need to search
 Picnic products, manage shopping carts, place grocery orders, check delivery
 windows, browse or create recipes, or interact with the Picnic storefront API.
compatibility: >-
 Requires curl and a shell (bash/zsh). Requires a Picnic customer account and
 network access to storefront-prod.nl.picnicinternational.com.
metadata:
 author: Picnic
 version: "1.0.0"
---

# /picnic-api-skill — Picnic Grocery Delivery API

You are an assistant that helps users interact with the Picnic grocery delivery
API. You can search products, manage carts, browse favorites, check orders and
delivery slots, and browse and create recipes.

## Trigger

Activates when the user mentions Picnic, grocery shopping, cart management,
delivery slots, recipe ingredients, or fridge restocking:

```
Search for pasta products on Picnic
Add 2 units of product s1000786 to my cart
What delivery slots are available?
Show me my order history
Find a chicken recipe and add all its ingredients to my cart
补全冰箱我要做博洛尼亚意大利面
```

## Authentication

### Pre-configured Hackathon Account

Use these credentials (hackathon accounts skip 2FA):

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

### Verify Token

```bash
# Quick health check — should return products
curl -s -X GET "https://storefront-prod.nl.picnicinternational.com/api/15/pages/hackathon-search-products?query=milk&limit=2" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001" | head -200
```

If token is empty or returns `{}`, re-authenticate.

## Making Requests

Every request requires these headers:

```
x-picnic-auth: $(cat /tmp/picnic-token)
x-picnic-agent: 30100;3.3.0
x-picnic-did: AGENT-001
```

### GET endpoints — query params in URL

```bash
curl -s -X GET "https://storefront-prod.nl.picnicinternational.com/api/15/pages/hackathon-search-products?query=milk&limit=5" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001"
```

### POST endpoints — payload in JSON body

```bash
curl -s -X POST "https://storefront-prod.nl.picnicinternational.com/api/15/pages/task/hackathon-add-to-cart" \
  -H "Content-Type: application/json" \
  -H "x-picnic-auth: $(cat /tmp/picnic-token)" \
  -H "x-picnic-agent: 30100;3.3.0" \
  -H "x-picnic-did: AGENT-001" \
  -d '{"payload": {"selling_unit_id": "s1234", "count": 2}}'
```

## Endpoint Parameters

All endpoint IDs are prefixed with `hackathon-` (omitted below for brevity).

**No parameters:** `get-cart`, `get-delivery-slots`, `get-selected-delivery-slot`

**Search & browse:**
- `search-products`: `query` (required), `limit` (default 20)
- `search-suggestions`: `query` (required)
- `list-categories`: `limit` (default 50), `offset` (default 0)
- `get-subcategories`: `category_id` (required)
- `get-product`: `selling_unit_id` (required)
- `get-product-alternatives`: `selling_unit_id` (required)

**Cart:**
- `add-to-cart`: `selling_unit_id`, `count`
- `remove-from-cart`: `selling_unit_id`, `count` (optional — omit to remove all)
- `clear-cart`: empty payload `{}`

> **Important:** `get-cart` returns full product details. Mutation endpoints return minimal internal state. Always call `get-cart` after a mutation if you need product names or prices.

**Favorites:**
- `list-favorites`: `limit` (default 50), `offset` (default 0)
- `toggle-favorite`: `selling_unit_id`, `status` (`"LIKE"` or `"UNLIKE"`)

**Orders:**
- `list-orders`: `limit` (default 20), `offset` (default 0)
- `get-order`: `delivery_id` (required)

**Recipes:**
- `search-recipes`: `query` (required), `limit` (default 20)
- `get-recipe`: `id` (required)
- `get-recipes`: `ids` (required, array — pass as `?ids=a&ids=b`)
- `get-recipe-recommendations`: `limit` (default 10)

## Key Conventions

- **Prices**: integer cents (divide by 100 for EUR)
- **Product IDs**: selling unit IDs prefixed with `s` (e.g. `s1132274`)
- **Timestamps**: epoch milliseconds in hackathon endpoint responses
- **Empty `{}` response**: usually means bad auth token — re-authenticate

## Error Responses

| Situation | What you get |
|-----------|-------------|
| Missing required parameter | Clear message naming the field |
| Non-existent product ID in mutation | `JAVASCRIPT_INTERNAL_ERROR` — treat as "not found" |
| Expired auth token | Empty object `{}` with HTTP 200. Re-authenticate. |

## Detailed Endpoint Reference

For full request/response schemas with field types, see:
- **Shopping endpoints**: [references/shopping.md](references/shopping.md)
- **Recipe endpoints**: [references/recipes.md](references/recipes.md)
