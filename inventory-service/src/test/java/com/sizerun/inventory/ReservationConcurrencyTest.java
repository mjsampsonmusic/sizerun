package com.sizerun.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.sizerun.inventory.reservation.InsufficientStockException;
import com.sizerun.inventory.reservation.ReservationService;
import com.sizerun.inventory.reservation.ReserveRequest;
import com.sizerun.inventory.reservation.ReserveRequest.LineRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Many shoppers hitting the same sizes at the same moment, against a real database. */
class ReservationConcurrencyTest extends IntegrationTest {

    @Autowired
    private ReservationService reservations;

    @Test
    void twentyShoppersRaceForFivePairsAndExactlyFiveGetThem() throws Exception {
        String sku = "TRL2-GRN-100";
        setStock("CHI01", sku, 5);

        List<Boolean> outcomes = race(20, shopper -> {
            try {
                reservations.reserve(new ReserveRequest("race-" + shopper, "CHI01", List.of(new LineRequest(sku, 1))));
                return true;
            } catch (InsufficientStockException soldOut) {
                return false;
            }
        });

        assertThat(outcomes.stream().filter(gotAPair -> gotAPair).count()).isEqualTo(5);
        assertThat(stockOf("CHI01", sku)).isZero();
    }

    @Test
    void ordersSharingSizesInOppositeOrderNeverDeadlock() throws Exception {
        String court = "CRT-WHT-085";
        String walker = "WLK-CHR-085";
        setStock("NYC01", court, 100);
        setStock("NYC01", walker, 100);

        List<Boolean> outcomes = race(20, shopper -> {
            List<LineRequest> lines = shopper % 2 == 0
                    ? List.of(new LineRequest(court, 1), new LineRequest(walker, 1))
                    : List.of(new LineRequest(walker, 1), new LineRequest(court, 1));
            reservations.reserve(new ReserveRequest("pair-" + shopper, "NYC01", lines));
            return true;
        });

        assertThat(outcomes).hasSize(20).containsOnly(true);
        assertThat(stockOf("NYC01", court)).isEqualTo(80);
        assertThat(stockOf("NYC01", walker)).isEqualTo(80);
    }

    /** Starts every shopper at the same instant and collects what happened to each one. */
    private List<Boolean> race(int shoppers, IntFunction<Boolean> shopper) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(shoppers);
        try {
            CountDownLatch startingGun = new CountDownLatch(1);
            List<Future<Boolean>> futures = new ArrayList<>();
            for (int i = 0; i < shoppers; i++) {
                int shopperNumber = i;
                futures.add(pool.submit(() -> {
                    startingGun.await();
                    return shopper.apply(shopperNumber);
                }));
            }
            startingGun.countDown();

            List<Boolean> outcomes = new ArrayList<>();
            for (Future<Boolean> future : futures) {
                outcomes.add(future.get(60, TimeUnit.SECONDS));
            }
            return outcomes;
        } finally {
            pool.shutdownNow();
        }
    }
}
