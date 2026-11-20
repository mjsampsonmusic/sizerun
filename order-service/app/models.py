import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class OrderStatus(enum.StrEnum):
    PENDING = "PENDING"  # saved, waiting on the inventory service
    CONFIRMED = "CONFIRMED"  # stock is reserved
    REJECTED = "REJECTED"  # a size was short, or the store or SKU does not exist
    CANCELLED = "CANCELLED"  # stock went back on the shelf


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    store_code: Mapped[str] = mapped_column(String(10), index=True)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, native_enum=False, length=16))
    reason: Mapped[str | None] = mapped_column(String(200))
    reservation_id: Mapped[uuid.UUID | None]
    total_cents: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderLine.sku", lazy="selectin"
    )

    def to_json(self) -> dict:
        return {
            "id": str(self.id),
            "storeCode": self.store_code,
            "status": self.status.value,
            "reason": self.reason,
            "reservationId": str(self.reservation_id) if self.reservation_id else None,
            "totalCents": self.total_cents,
            "createdAt": self.created_at.isoformat(),
            "lines": [line.to_json() for line in self.lines],
        }


class OrderLine(Base):
    __tablename__ = "order_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[int]
    unit_price_cents: Mapped[int | None]

    order: Mapped[Order] = relationship(back_populates="lines")

    def to_json(self) -> dict:
        return {"sku": self.sku, "quantity": self.quantity, "unitPriceCents": self.unit_price_cents}
