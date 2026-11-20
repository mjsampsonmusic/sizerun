package com.sizerun.inventory.reservation;

import com.sizerun.inventory.catalog.Store;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Stock held for one order. The order service passes its order ID as orderRef. */
@Entity
@Table(name = "reservation")
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "order_ref", nullable = false, unique = true)
    private String orderRef;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "released_at")
    private Instant releasedAt;

    @OneToMany(mappedBy = "reservation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sku")
    private List<ReservationLine> lines = new ArrayList<>();

    protected Reservation() {
    }

    public Reservation(String orderRef, Store store) {
        this.orderRef = orderRef;
        this.store = store;
        this.status = ReservationStatus.ACTIVE;
        this.createdAt = Instant.now();
    }

    void addLine(String sku, int quantity, int unitPriceCents) {
        lines.add(new ReservationLine(this, sku, quantity, unitPriceCents));
    }

    void release() {
        status = ReservationStatus.RELEASED;
        releasedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getOrderRef() {
        return orderRef;
    }

    public Store getStore() {
        return store;
    }

    public ReservationStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReleasedAt() {
        return releasedAt;
    }

    public List<ReservationLine> getLines() {
        return lines;
    }
}
