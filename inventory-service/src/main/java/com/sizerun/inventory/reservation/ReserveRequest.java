package com.sizerun.inventory.reservation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ReserveRequest(
        @NotBlank @Size(max = 64) String orderRef,
        @NotBlank @Size(max = 10) String storeCode,
        @NotEmpty @Size(max = 20) List<@Valid @NotNull LineRequest> lines) {

    public record LineRequest(@NotBlank @Size(max = 32) String sku, @Min(1) @Max(10) int quantity) {
    }
}
