package com.sizerun.inventory.reservation;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ReservationView(
        UUID id,
        String orderRef,
        String storeCode,
        ReservationStatus status,
        Instant createdAt,
        Instant releasedAt,
        List<LineView> lines,
        int totalCents) {

    public record LineView(String sku, int quantity, int unitPriceCents) {
    }

    static ReservationView from(Reservation reservation) {
        List<LineView> lines = reservation.getLines().stream()
                .map(line -> new LineView(line.getSku(), line.getQuantity(), line.getUnitPriceCents()))
                .toList();
        int totalCents = lines.stream().mapToInt(line -> line.quantity() * line.unitPriceCents()).sum();
        return new ReservationView(
                reservation.getId(),
                reservation.getOrderRef(),
                reservation.getStore().getCode(),
                reservation.getStatus(),
                reservation.getCreatedAt(),
                reservation.getReleasedAt(),
                lines,
                totalCents);
    }
}
