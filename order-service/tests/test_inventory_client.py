import json

import pytest
import responses

from app.inventory import InventoryClient, InventoryRejected, InventoryUnavailable, OutOfStock

BASE = "http://inventory.test"


@responses.activate
def test_reserve_sends_the_order_and_returns_the_reservation():
    responses.post(f"{BASE}/api/reservations", json={"id": "r-1", "lines": [], "totalCents": 0}, status=201)

    reservation = InventoryClient(BASE).reserve("order-1", "IND01", [{"sku": "RUN1-NVY-095", "quantity": 1}])

    assert reservation["id"] == "r-1"
    assert json.loads(responses.calls[0].request.body) == {
        "orderRef": "order-1",
        "storeCode": "IND01",
        "lines": [{"sku": "RUN1-NVY-095", "quantity": 1}],
    }


@responses.activate
def test_conflict_means_out_of_stock():
    responses.post(
        f"{BASE}/api/reservations",
        json={"code": "INSUFFICIENT_STOCK", "sku": "CRT-WHT-100", "requested": 2, "available": 1},
        status=409,
    )

    with pytest.raises(OutOfStock) as caught:
        InventoryClient(BASE).reserve("order-2", "IND01", [{"sku": "CRT-WHT-100", "quantity": 2}])

    assert (caught.value.sku, caught.value.requested, caught.value.available) == ("CRT-WHT-100", 2, 1)


@responses.activate
def test_not_found_means_rejected():
    responses.post(f"{BASE}/api/reservations", json={"detail": "No store with code XYZ99"}, status=404)

    with pytest.raises(InventoryRejected, match="No store with code XYZ99"):
        InventoryClient(BASE).reserve("order-3", "XYZ99", [{"sku": "RUN1-NVY-095", "quantity": 1}])


@responses.activate
def test_server_errors_mean_unavailable():
    responses.post(f"{BASE}/api/reservations/r-9/release", status=500)

    with pytest.raises(InventoryUnavailable):
        InventoryClient(BASE).release("r-9")


@responses.activate
def test_unreachable_service_means_unavailable():
    with pytest.raises(InventoryUnavailable):
        InventoryClient(BASE).release("r-10")
