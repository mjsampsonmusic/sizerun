package com.sizerun.inventory.catalog;

import com.sizerun.inventory.web.NotFoundException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CatalogService {

    private final StoreRepository stores;
    private final ProductRepository products;
    private final StockRepository stock;

    public CatalogService(StoreRepository stores, ProductRepository products, StockRepository stock) {
        this.stores = stores;
        this.products = products;
        this.stock = stock;
    }

    public List<StoreView> stores() {
        return stores.findAll(Sort.by("code")).stream().map(StoreView::from).toList();
    }

    /** Every style with its full size run and how many of each size this store has on hand. */
    public List<StyleView> catalog(String storeCode) {
        Store store = stores.findByCode(storeCode)
                .orElseThrow(() -> new NotFoundException("No store with code " + storeCode));

        Map<String, Integer> onHand = stock.findByStoreId(store.getId()).stream()
                .collect(Collectors.toMap(Stock::getSku, Stock::getQuantity));

        Map<String, List<Product>> byStyle = products.findAll(Sort.by("styleCode", "usSize")).stream()
                .collect(Collectors.groupingBy(Product::getStyleCode, LinkedHashMap::new, Collectors.toList()));

        return byStyle.values().stream()
                .map(styleProducts -> StyleView.from(styleProducts, onHand))
                .toList();
    }
}
