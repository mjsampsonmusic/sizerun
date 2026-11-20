import uuid

import pytest

RUNNER = "RUN1-NVY-095"  # 5 in stock at $130.00
COURT = "CRT-WHT-100"  # 1 in stock at $95.00


def place(client, lines, key=None, store="IND01"):
    return client.post(
        "/api/orders",
        json={"storeCode": store, "lines": lines},
        headers={"Idempotency-Key": key or str(uuid.uuid4())},
    )


def test_places_an_order_with_prices_from_inventory(client, inventory):
    response = place(client, [{"sku": RUNNER, "quantity": 2}])

    assert response.status_code == 201
    order = response.get_json()
    assert order["status"] == "CONFIRMED"
    assert order["totalCents"] == 26000
    assert order["lines"] == [{"sku": RUNNER, "quantity": 2, "unitPriceCents": 13000}]
    assert inventory.stock[RUNNER] == 3
    assert inventory.reservations[order["reservationId"]]["orderRef"] == order["id"]


def test_retry_with_the_same_key_returns_the_same_order_without_reserving_again(client, inventory):
    key = str(uuid.uuid4())
    first = place(client, [{"sku": RUNNER, "quantity": 1}], key=key)
    retry = place(client, [{"sku": RUNNER, "quantity": 1}], key=key)

    assert retry.status_code == 201
    assert retry.get_json()["id"] == first.get_json()["id"]
    assert inventory.reserve_calls == 1
    assert inventory.stock[RUNNER] == 4


def test_reusing_a_key_for_a_different_order_is_refused(client):
    key = str(uuid.uuid4())
    place(client, [{"sku": RUNNER, "quantity": 1}], key=key)

    response = place(client, [{"sku": RUNNER, "quantity": 2}], key=key)

    assert response.status_code == 422
    assert response.mimetype == "application/problem+json"


def test_out_of_stock_rejects_the_order_with_a_reason(client, inventory):
    response = place(client, [{"sku": RUNNER, "quantity": 1}, {"sku": COURT, "quantity": 2}])

    assert response.status_code == 409
    order = response.get_json()
    assert order["status"] == "REJECTED"
    assert order["reason"] == f"Only 1 left of {COURT}, 2 requested"
    assert inventory.stock == {RUNNER: 5, COURT: 1}


def test_unknown_sku_rejects_the_order(client):
    response = place(client, [{"sku": "NOPE-000", "quantity": 1}])

    assert response.status_code == 409
    assert response.get_json()["reason"] == "No product with SKU NOPE-000"


def test_order_waits_while_inventory_is_down_and_confirms_on_retry(client, inventory):
    key = str(uuid.uuid4())
    inventory.down = True
    pending = place(client, [{"sku": RUNNER, "quantity": 1}], key=key)

    assert pending.status_code == 503
    assert pending.get_json()["status"] == "PENDING"

    inventory.down = False
    confirmed = place(client, [{"sku": RUNNER, "quantity": 1}], key=key)

    assert confirmed.status_code == 201
    assert confirmed.get_json()["id"] == pending.get_json()["id"]
    assert confirmed.get_json()["status"] == "CONFIRMED"


def test_cancel_puts_stock_back_once(client, inventory):
    order = place(client, [{"sku": RUNNER, "quantity": 2}]).get_json()

    first = client.post(f"/api/orders/{order['id']}/cancel")
    again = client.post(f"/api/orders/{order['id']}/cancel")

    assert first.status_code == 200
    assert first.get_json()["status"] == "CANCELLED"
    assert again.status_code == 200
    assert inventory.release_calls == 1
    assert inventory.stock[RUNNER] == 5


def test_only_confirmed_orders_can_be_cancelled(client):
    rejected = place(client, [{"sku": COURT, "quantity": 2}]).get_json()

    response = client.post(f"/api/orders/{rejected['id']}/cancel")

    assert response.status_code == 409


def test_cancel_while_inventory_is_down_leaves_the_order_confirmed(client, inventory):
    order = place(client, [{"sku": RUNNER, "quantity": 1}]).get_json()
    inventory.down = True

    response = client.post(f"/api/orders/{order['id']}/cancel")

    assert response.status_code == 503
    assert client.get(f"/api/orders/{order['id']}").get_json()["status"] == "CONFIRMED"


@pytest.mark.parametrize(
    "body",
    [
        None,
        {"lines": [{"sku": RUNNER, "quantity": 1}]},
        {"storeCode": "IND01", "lines": []},
        {"storeCode": "IND01", "lines": [{"sku": RUNNER, "quantity": 0}]},
        {"storeCode": "IND01", "lines": [{"sku": RUNNER, "quantity": True}]},
        {"storeCode": "IND01", "lines": [{"sku": RUNNER, "quantity": "2"}]},
        {"storeCode": "IND01", "lines": [{"sku": RUNNER, "quantity": 6}, {"sku": RUNNER, "quantity": 5}]},
    ],
)
def test_rejects_malformed_orders(client, inventory, body):
    response = client.post("/api/orders", json=body, headers={"Idempotency-Key": str(uuid.uuid4())})

    assert response.status_code == 400
    assert inventory.reserve_calls == 0


def test_requires_an_idempotency_key(client):
    response = client.post("/api/orders", json={"storeCode": "IND01", "lines": [{"sku": RUNNER, "quantity": 1}]})

    assert response.status_code == 400


def test_lists_newest_orders_first_and_filters_by_store(client):
    older = place(client, [{"sku": RUNNER, "quantity": 1}]).get_json()
    newer = place(client, [{"sku": RUNNER, "quantity": 1}]).get_json()
    place(client, [{"sku": RUNNER, "quantity": 1}], store="CHI01")

    orders = client.get("/api/orders?store=IND01").get_json()

    assert [order["id"] for order in orders] == [newer["id"], older["id"]]


def test_unknown_order_is_not_found(client):
    assert client.get(f"/api/orders/{uuid.uuid4()}").status_code == 404
    assert client.post(f"/api/orders/{uuid.uuid4()}/cancel").status_code == 404


def test_health_checks(client):
    assert client.get("/healthz").get_json() == {"status": "UP"}
    assert client.get("/readyz").get_json() == {"status": "UP"}
