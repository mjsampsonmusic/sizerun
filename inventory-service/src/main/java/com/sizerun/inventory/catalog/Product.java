package com.sizerun.inventory.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/** One size of one style and color, such as Tempo Runner in Midnight Navy, size 9.5. */
@Entity
@Table(name = "product")
public class Product {

    @Id
    private String sku;

    @Column(name = "style_code", nullable = false)
    private String styleCode;

    @Column(name = "style_name", nullable = false)
    private String styleName;

    @Column(nullable = false)
    private String color;

    @Column(name = "us_size", nullable = false)
    private BigDecimal usSize;

    @Column(name = "price_cents", nullable = false)
    private int priceCents;

    protected Product() {
    }

    public String getSku() {
        return sku;
    }

    public String getStyleCode() {
        return styleCode;
    }

    public String getStyleName() {
        return styleName;
    }

    public String getColor() {
        return color;
    }

    public BigDecimal getUsSize() {
        return usSize;
    }

    public int getPriceCents() {
        return priceCents;
    }

    /** The size the way a shoe box prints it: "9.5" or "10". */
    public String getSizeLabel() {
        return usSize.stripTrailingZeros().toPlainString();
    }
}
