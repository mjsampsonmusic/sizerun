package com.sizerun.inventory.reservation;

import com.sizerun.inventory.catalog.Product;
import com.sizerun.inventory.catalog.ProductRepository;
import com.sizerun.inventory.catalog.Stock;
import com.sizerun.inventory.catalog.StockRepository;
import com.sizerun.inventory.catalog.Store;
import com.sizerun.inventory.catalog.StoreRepository;
import com.sizerun.inventory.web.NotFoundException;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReservationService {

    private static final Logger log = LoggerFactory.getLogger(ReservationService.class);

    private final ReservationRepository reservations;
    private final StoreRepository stores;
    private final ProductRepository products;
    private final StockRepository stock;

    public ReservationService(
            ReservationRepository reservations,
            StoreRepository stores,
            ProductRepository products,
            StockRepository stock) {
        this.reservations = reservations;
        this.stores = stores;
        this.products = products;
        this.stock = stock;
    }

    /** {@code created} is false when this order already had a reservation and we returned that one. */
    public record ReserveResult(ReservationView reservation, boolean created) {
    }

    /**
     * Reserves every line of an order or none of them. All stock changes happen in one transaction,
     * so if any size is short, the sizes already taken go back automatically.
     */
    @Transactional
    public ReserveResult reserve(ReserveRequest request) {
        Optional<Reservation> existing = reservations.findByOrderRef(request.orderRef());
        if (existing.isPresent()) {
            return new ReserveResult(ReservationView.from(existing.get()), false);
        }

        Store store = stores.findByCode(request.storeCode())
                .orElseThrow(() -> new NotFoundException("No store with code " + request.storeCode()));

        // Merge repeated SKUs and sort them. Taking stock rows in the same order every time means two
        // orders that share sizes wait for each other instead of deadlocking.
        Map<String, Integer> wanted = new TreeMap<>();
        request.lines().forEach(line -> wanted.merge(line.sku(), line.quantity(), Integer::sum));

        Map<String, Product> catalog = products.findAllById(wanted.keySet()).stream()
                .collect(Collectors.toMap(Product::getSku, Function.identity()));
        for (String sku : wanted.keySet()) {
            if (!catalog.containsKey(sku)) {
                throw new NotFoundException("No product with SKU " + sku);
            }
        }

        // Insert the reservation first: a duplicate request for the same order then fails on the
        // unique order_ref index before it touches any stock.
        Reservation reservation = reservations.saveAndFlush(new Reservation(request.orderRef(), store));

        for (Map.Entry<String, Integer> line : wanted.entrySet()) {
            String sku = line.getKey();
            int quantity = line.getValue();
            if (stock.takeIfAvailable(store.getId(), sku, quantity) == 0) {
                int available = stock.findByStoreIdAndSku(store.getId(), sku).map(Stock::getQuantity).orElse(0);
                throw new InsufficientStockException(sku, quantity, available);
            }
            reservation.addLine(sku, quantity, catalog.get(sku).getPriceCents());
        }

        log.info("Reserved {} sizes at {} for order {}", wanted.size(), store.getCode(), request.orderRef());
        return new ReserveResult(ReservationView.from(reservation), true);
    }

    @Transactional(readOnly = true)
    public Optional<ReservationView> findByOrderRef(String orderRef) {
        return reservations.findByOrderRef(orderRef).map(ReservationView::from);
    }

    @Transactional(readOnly = true)
    public ReservationView get(UUID id) {
        return reservations.findById(id)
                .map(ReservationView::from)
                .orElseThrow(() -> new NotFoundException("No reservation with id " + id));
    }

    /** Puts the stock back. Releasing twice is safe: the second call changes nothing. */
    @Transactional
    public ReservationView release(UUID id) {
        Reservation reservation = reservations.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("No reservation with id " + id));
        if (reservation.getStatus() == ReservationStatus.ACTIVE) {
            Long storeId = reservation.getStore().getId();
            for (ReservationLine line : reservation.getLines()) {
                stock.putBack(storeId, line.getSku(), line.getQuantity());
            }
            reservation.release();
            log.info("Released reservation {} for order {}", id, reservation.getOrderRef());
        }
        return ReservationView.from(reservation);
    }
}
