package com.sizerun.inventory.catalog;

public record StoreView(String code, String name, String city) {

    static StoreView from(Store store) {
        return new StoreView(store.getCode(), store.getName(), store.getCity());
    }
}
