import os
import uuid

import pytest
from sqlalchemy import text

from app import create_app
from app.inventory import InventoryRejected, InventoryUnavailable, OutOfStock

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://sizerun:sizerun@localhost:5432/orders_test"
)


class FakeInventory:
    """Stands in for the inventory service: in-memory stock with the same rules as the real one."""

    def __init__(self):
        self.stock: dict[str, int] = {}
        self.prices: dict[str, int] = {}
        self.reservations: dict[str, dict] = {}
        self.by_order: dict[str, str] = {}
        self.down = False
        self.reserve_calls = 0
        self.release_calls = 0

    def add(self, sku: str, quantity: int, price_cents: int) -> None:
        self.stock[sku] = quantity
        self.prices[sku] = price_cents

    def reserve(self, order_ref: str, store_code: str, lines: list[dict]) -> dict:
        self.reserve_calls += 1
        if self.down:
            raise InventoryUnavailable("inventory is down")
        if order_ref in self.by_order:
            return self.reservations[self.by_order[order_ref]]
        for line in lines:
            if line["sku"] not in self.stock:
                raise InventoryRejected(f"No product with SKU {line['sku']}")
            if self.stock[line["sku"]] < line["quantity"]:
                raise OutOfStock(line["sku"], line["quantity"], self.stock[line["sku"]])
        for line in lines:
            self.stock[line["sku"]] -= line["quantity"]
        priced = [{**line, "unitPriceCents": self.prices[line["sku"]]} for line in lines]
        reservation = {
            "id": str(uuid.uuid4()),
            "orderRef": order_ref,
            "storeCode": store_code,
            "status": "ACTIVE",
            "lines": priced,
            "totalCents": sum(line["quantity"] * line["unitPriceCents"] for line in priced),
        }
        self.reservations[reservation["id"]] = reservation
        self.by_order[order_ref] = reservation["id"]
        return reservation

    def release(self, reservation_id: str) -> dict:
        self.release_calls += 1
        if self.down:
            raise InventoryUnavailable("inventory is down")
        reservation = self.reservations.get(reservation_id)
        if reservation is None:
            raise InventoryRejected("Reservation not found")
        if reservation["status"] == "ACTIVE":
            for line in reservation["lines"]:
                self.stock[line["sku"]] += line["quantity"]
            reservation["status"] = "RELEASED"
        return reservation


@pytest.fixture
def inventory() -> FakeInventory:
    fake = FakeInventory()
    fake.add("RUN1-NVY-095", 5, 13000)
    fake.add("CRT-WHT-100", 1, 9500)
    return fake


@pytest.fixture
def app(inventory):
    app = create_app({"DATABASE_URL": TEST_DATABASE_URL, "TESTING": True}, inventory_client=inventory)
    engine = app.extensions["db_engine"]
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE order_lines, orders"))
    yield app
    engine.dispose()


@pytest.fixture
def client(app):
    return app.test_client()
