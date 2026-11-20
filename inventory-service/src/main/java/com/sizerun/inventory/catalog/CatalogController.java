package com.sizerun.inventory.catalog;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stores")
public class CatalogController {

    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public List<StoreView> stores() {
        return catalog.stores();
    }

    @GetMapping("/{code}/catalog")
    public List<StyleView> catalog(@PathVariable("code") String code) {
        return catalog.catalog(code);
    }
}
