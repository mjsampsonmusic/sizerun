#!/usr/bin/env bash
# End-to-end check of the running stack, through the same front door the browser uses:
# order 2 pairs -> stock drops -> a retry is safe -> an oversized order is rejected -> cancel -> stock returns.
#
# Usage: BASE_URL=http://localhost:4200 ./scripts/smoke-test.sh   (needs curl and jq)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4200}"
STORE="IND01"
RESPONSE="$(mktemp)"
trap 'rm -f "$RESPONSE"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

wait_for() {
  for _ in $(seq 1 60); do
    if curl -fsS "$1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  fail "$1 did not answer within 3 minutes"
}

stock_of() {
  curl -fsS "$BASE_URL/api/stores/$STORE/catalog" |
    jq --arg sku "$1" '[.[].sizes[] | select(.sku == $sku)][0].available'
}

# Arguments: idempotency key, sku, quantity. Prints the HTTP status; the body lands in $RESPONSE.
post_order() {
  curl -sS -o "$RESPONSE" -w '%{http_code}' -X POST "$BASE_URL/api/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $1" \
    -d "{\"storeCode\":\"$STORE\",\"lines\":[{\"sku\":\"$2\",\"quantity\":$3}]}"
}

echo "Waiting for the stack at $BASE_URL"
wait_for "$BASE_URL/api/stores"
wait_for "$BASE_URL/api/orders?limit=1"

SKU=$(curl -fsS "$BASE_URL/api/stores/$STORE/catalog" | jq -r '[.[].sizes[] | select(.available >= 2)][0].sku')
[ -n "$SKU" ] && [ "$SKU" != "null" ] || fail "no size at $STORE has 2 or more in stock"
BEFORE=$(stock_of "$SKU")
echo "Ordering 2 of $SKU at $STORE ($BEFORE on hand)"

KEY="smoke-$(date +%s)-$RANDOM"
CODE=$(post_order "$KEY" "$SKU" 2)
[ "$CODE" = 201 ] || fail "order returned HTTP $CODE: $(cat "$RESPONSE")"
ORDER_ID=$(jq -r .id "$RESPONSE")
[ "$(jq -r .status "$RESPONSE")" = CONFIRMED ] || fail "order was not confirmed"
[ "$(stock_of "$SKU")" = "$((BEFORE - 2))" ] || fail "stock did not drop by 2"
echo "  confirmed order $ORDER_ID; stock now $((BEFORE - 2))"

CODE=$(post_order "$KEY" "$SKU" 2)
[ "$CODE" = 201 ] && [ "$(jq -r .id "$RESPONSE")" = "$ORDER_ID" ] || fail "retry did not return the same order"
[ "$(stock_of "$SKU")" = "$((BEFORE - 2))" ] || fail "the retry took stock a second time"
echo "  retry with the same Idempotency-Key returned the same order; stock unchanged"

TOO_MANY=$(($(stock_of "$SKU") + 1))
if [ "$TOO_MANY" -le 10 ]; then
  CODE=$(post_order "smoke-big-$(date +%s)-$RANDOM" "$SKU" "$TOO_MANY")
  [ "$CODE" = 409 ] && [ "$(jq -r .status "$RESPONSE")" = REJECTED ] || fail "ordering $TOO_MANY was not rejected (HTTP $CODE)"
  echo "  ordering $TOO_MANY was rejected: $(jq -r .reason "$RESPONSE")"
fi

CODE=$(curl -sS -o "$RESPONSE" -w '%{http_code}' -X POST "$BASE_URL/api/orders/$ORDER_ID/cancel")
[ "$CODE" = 200 ] && [ "$(jq -r .status "$RESPONSE")" = CANCELLED ] || fail "cancel returned HTTP $CODE"
[ "$(stock_of "$SKU")" = "$BEFORE" ] || fail "cancel did not put the stock back"
echo "  cancelled; stock back to $BEFORE"

echo "Smoke test passed"
