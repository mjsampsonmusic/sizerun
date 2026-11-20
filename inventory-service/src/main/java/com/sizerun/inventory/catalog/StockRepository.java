package com.sizerun.inventory.catalog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StockRepository extends JpaRepository<Stock, Long> {

    List<Stock> findByStoreId(Long storeId);

    Optional<Stock> findByStoreIdAndSku(Long storeId, String sku);

    /**
     * Takes stock only if enough is on hand, as one atomic UPDATE. PostgreSQL locks the row while it
     * checks the quantity, so two orders can never both take the last pair.
     *
     * @return 1 if the stock was taken, 0 if there was not enough
     */
    @Modifying
    @Query("update Stock s set s.quantity = s.quantity - :quantity "
            + "where s.storeId = :storeId and s.sku = :sku and s.quantity >= :quantity")
    int takeIfAvailable(@Param("storeId") Long storeId, @Param("sku") String sku, @Param("quantity") int quantity);

    @Modifying
    @Query("update Stock s set s.quantity = s.quantity + :quantity where s.storeId = :storeId and s.sku = :sku")
    int putBack(@Param("storeId") Long storeId, @Param("sku") String sku, @Param("quantity") int quantity);
}
