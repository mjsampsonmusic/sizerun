package com.sizerun.inventory.reservation;

public enum ReservationStatus {
    /** Stock is held for the order. */
    ACTIVE,
    /** The order was cancelled and the stock went back on the shelf. */
    RELEASED
}
