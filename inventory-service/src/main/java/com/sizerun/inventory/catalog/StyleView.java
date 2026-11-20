package com.sizerun.inventory.catalog;

import java.util.List;
import java.util.Map;

/** One style and color with its size run, the way a store tablet shows it. */
public record StyleView(String styleCode, String name, String color, int priceCents, List<SizeView> sizes) {

    public record SizeView(String size, String sku, int available) {
    }

    static StyleView from(List<Product> styleProducts, Map<String, Integer> onHand) {
        Product first = styleProducts.get(0);
        List<SizeView> sizes = styleProducts.stream()
                .map(product -> new SizeView(
                        product.getSizeLabel(), product.getSku(), onHand.getOrDefault(product.getSku(), 0)))
                .toList();
        return new StyleView(
                first.getStyleCode(), first.getStyleName(), first.getColor(), first.getPriceCents(), sizes);
    }
}
