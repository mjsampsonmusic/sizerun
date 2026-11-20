"""Order endpoints.

Every order is placed with an Idempotency-Key header, so a client that retries after a timeout gets
the same order back instead of a second one. The order ID doubles as the inventory reservation key,
which makes the call to the inventory service safe to retry as well.
"""

import uuid

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_session
from .inventory import InventoryRejected, InventoryUnavailable
from .models import Order, OrderLine, OrderStatus

bp = Blueprint("orders", __name__)

MAX_LINES = 20
MAX_PER_SIZE = 10

# The status code alone tells the client what happened to the order.
STATUS_CODES = {
    OrderStatus.CONFIRMED: 201,
    OrderStatus.REJECTED: 409,
    OrderStatus.PENDING: 503,
    OrderStatus.CANCELLED: 200,
}

TITLES = {
    400: "Bad request",
    404: "Not found",
    409: "Conflict",
    422: "Unprocessable content",
    502: "Bad gateway",
    503: "Service unavailable",
}


def problem(status: int, detail: str):
    """An RFC 9457 problem response, the same error format the inventory service uses."""
    response = jsonify(
        {"type": "about:blank", "title": TITLES.get(status, "Error"), "status": status, "detail": detail}
    )
    response.status_code = status
    response.mimetype = "application/problem+json"
    return response


def parse_order(payload) -> tuple[str, dict[str, int]]:
    """Returns (store code, {sku: quantity}) or raises ValueError with a message for the caller."""
    if not isinstance(payload, dict):
        raise ValueError("Send the order as a JSON object")
    store_code = payload.get("storeCode")
    if not isinstance(store_code, str) or not store_code.strip() or len(store_code) > 10:
        raise ValueError("storeCode is required (up to 10 characters)")
    lines = payload.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= MAX_LINES:
        raise ValueError(f"lines must hold 1 to {MAX_LINES} items")

    quantities: dict[str, int] = {}
    for line in lines:
        sku = line.get("sku") if isinstance(line, dict) else None
        quantity = line.get("quantity") if isinstance(line, dict) else None
        if not isinstance(sku, str) or not sku.strip() or len(sku) > 32:
            raise ValueError("Each line needs a sku (up to 32 characters)")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
            raise ValueError("Each line needs a whole-number quantity of at least 1")
        quantities[sku] = quantities.get(sku, 0) + quantity
    if any(quantity > MAX_PER_SIZE for quantity in quantities.values()):
        raise ValueError(f"No more than {MAX_PER_SIZE} of one size per order")
    return store_code.strip(), dict(sorted(quantities.items()))


@bp.post("/api/orders")
def place_order():
    key = request.headers.get("Idempotency-Key", "").strip()
    if not key or len(key) > 64:
        return problem(400, "Send an Idempotency-Key header (up to 64 characters) so a retry never orders twice")
    try:
        store_code, quantities = parse_order(request.get_json(silent=True))
    except ValueError as exc:
        return problem(400, str(exc))

    session = get_session()
    order = _find_by_key(session, key)
    if order is None:
        order = Order(
            idempotency_key=key,
            store_code=store_code,
            status=OrderStatus.PENDING,
            lines=[OrderLine(sku=sku, quantity=quantity) for sku, quantity in quantities.items()],
        )
        session.add(order)
        try:
            session.commit()
        except IntegrityError:
            # A retry of this same request got here first; carry on with its order.
            session.rollback()
            order = _find_by_key(session, key)
            if order is None:
                return problem(409, "Another request is creating this order; try again")

    if not _same_order(order, store_code, quantities):
        return problem(422, "This Idempotency-Key was already used for a different order")

    if order.status == OrderStatus.PENDING:
        _reserve_stock(session, order)
    return jsonify(order.to_json()), STATUS_CODES[order.status]


@bp.get("/api/orders")
def list_orders():
    limit = max(1, min(request.args.get("limit", default=20, type=int), 100))
    query = select(Order).order_by(Order.created_at.desc()).limit(limit)
    store_code = request.args.get("store")
    if store_code:
        query = query.where(Order.store_code == store_code)
    orders = get_session().scalars(query).all()
    return jsonify([order.to_json() for order in orders])


@bp.get("/api/orders/<uuid:order_id>")
def get_order(order_id: uuid.UUID):
    order = get_session().get(Order, order_id)
    if order is None:
        return problem(404, f"No order with id {order_id}")
    return jsonify(order.to_json())


@bp.post("/api/orders/<uuid:order_id>/cancel")
def cancel_order(order_id: uuid.UUID):
    session = get_session()
    # Lock the row so two cancels of the same order cannot both release stock
    order = session.get(Order, order_id, with_for_update=True)
    if order is None:
        return problem(404, f"No order with id {order_id}")
    if order.status == OrderStatus.CANCELLED:
        return jsonify(order.to_json())
    if order.status != OrderStatus.CONFIRMED:
        return problem(409, f"Only confirmed orders can be cancelled; this one is {order.status.value}")

    try:
        current_app.extensions["inventory"].release(str(order.reservation_id))
    except InventoryUnavailable:
        return problem(503, "The inventory service is unavailable; try the cancel again")
    except InventoryRejected as exc:
        return problem(502, f"Inventory could not release the reservation: {exc}")

    order.status = OrderStatus.CANCELLED
    session.commit()
    return jsonify(order.to_json())


@bp.get("/healthz")
def healthz():
    """Liveness: the process is up."""
    return {"status": "UP"}


@bp.get("/readyz")
def readyz():
    """Readiness: the database answers, so this replica can take traffic."""
    try:
        get_session().execute(text("SELECT 1"))
    except Exception:  # any database failure means not ready
        return problem(503, "Database unavailable")
    return {"status": "UP"}


def _find_by_key(session: Session, key: str) -> Order | None:
    return session.scalar(select(Order).where(Order.idempotency_key == key))


def _same_order(order: Order, store_code: str, quantities: dict[str, int]) -> bool:
    return order.store_code == store_code and {line.sku: line.quantity for line in order.lines} == quantities


def _reserve_stock(session: Session, order: Order) -> None:
    inventory = current_app.extensions["inventory"]
    lines = [{"sku": line.sku, "quantity": line.quantity} for line in order.lines]
    try:
        reservation = inventory.reserve(order_ref=str(order.id), store_code=order.store_code, lines=lines)
    except InventoryRejected as exc:  # out of stock, or an unknown store or SKU
        order.status = OrderStatus.REJECTED
        order.reason = str(exc)[:200]
    except InventoryUnavailable as exc:
        # The order stays PENDING. Retrying with the same Idempotency-Key asks inventory again, and
        # inventory returns the same reservation if the first attempt actually went through.
        current_app.logger.warning("Order %s is pending: %s", order.id, exc)
        return
    else:
        prices = {line["sku"]: line["unitPriceCents"] for line in reservation["lines"]}
        for line in order.lines:
            line.unit_price_cents = prices.get(line.sku)
        order.reservation_id = uuid.UUID(reservation["id"])
        order.total_cents = reservation["totalCents"]
        order.status = OrderStatus.CONFIRMED
    session.commit()
