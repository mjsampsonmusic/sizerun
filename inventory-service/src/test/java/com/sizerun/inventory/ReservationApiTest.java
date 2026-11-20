package com.sizerun.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class ReservationApiTest extends IntegrationTest {

    private static final String RUNNER_9_5 = "RUN1-NVY-095";
    private static final String WALKER_10 = "WLK-CHR-100";

    private ResultActions reserve(String orderRef, String storeCode, Map<String, Integer> lines) throws Exception {
        List<Map<String, Object>> lineList = lines.entrySet().stream()
                .map(line -> Map.<String, Object>of("sku", line.getKey(), "quantity", line.getValue()))
                .toList();
        Map<String, Object> request = Map.of("orderRef", orderRef, "storeCode", storeCode, "lines", lineList);
        return mvc.perform(post("/api/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(request)));
    }

    @Test
    void reservingTakesStockAndPricesEachLine() throws Exception {
        setStock("IND01", RUNNER_9_5, 3);

        reserve("order-1", "IND01", Map.of(RUNNER_9_5, 2))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.storeCode").value("IND01"))
                .andExpect(jsonPath("$.lines[0].sku").value(RUNNER_9_5))
                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                .andExpect(jsonPath("$.lines[0].unitPriceCents").value(13000))
                .andExpect(jsonPath("$.totalCents").value(26000));

        assertThat(stockOf("IND01", RUNNER_9_5)).isEqualTo(1);
    }

    @Test
    void retryingTheSameOrderReturnsTheSameReservationWithoutTakingMoreStock() throws Exception {
        setStock("IND01", RUNNER_9_5, 3);

        String first = reserve("order-2", "IND01", Map.of(RUNNER_9_5, 1))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String second = reserve("order-2", "IND01", Map.of(RUNNER_9_5, 1))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(json.readTree(second).get("id").asText()).isEqualTo(json.readTree(first).get("id").asText());
        assertThat(stockOf("IND01", RUNNER_9_5)).isEqualTo(2);
    }

    @Test
    void anOrderIsAllOrNothingWhenOneSizeIsShort() throws Exception {
        setStock("IND01", RUNNER_9_5, 5);
        setStock("IND01", WALKER_10, 1);

        // RUN1 sorts before WLK, so the runner is taken first and must be put back when the walker is short
        reserve("order-3", "IND01", Map.of(RUNNER_9_5, 2, WALKER_10, 2))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_STOCK"))
                .andExpect(jsonPath("$.sku").value(WALKER_10))
                .andExpect(jsonPath("$.requested").value(2))
                .andExpect(jsonPath("$.available").value(1));

        assertThat(stockOf("IND01", RUNNER_9_5)).isEqualTo(5);
        assertThat(stockOf("IND01", WALKER_10)).isEqualTo(1);
    }

    @Test
    void releasingPutsStockBackExactlyOnce() throws Exception {
        setStock("IND01", RUNNER_9_5, 3);
        String created = reserve("order-4", "IND01", Map.of(RUNNER_9_5, 2))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = json.readTree(created).get("id").asText();
        assertThat(stockOf("IND01", RUNNER_9_5)).isEqualTo(1);

        mvc.perform(post("/api/reservations/{id}/release", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RELEASED"));
        mvc.perform(post("/api/reservations/{id}/release", id))
                .andExpect(status().isOk());

        assertThat(stockOf("IND01", RUNNER_9_5)).isEqualTo(3);
    }

    @Test
    void rejectsMalformedRequests() throws Exception {
        reserve("order-5", "IND01", Map.of()).andExpect(status().isBadRequest());
        reserve("order-6", "IND01", Map.of(RUNNER_9_5, 0)).andExpect(status().isBadRequest());
        reserve("", "IND01", Map.of(RUNNER_9_5, 1)).andExpect(status().isBadRequest());
    }

    @Test
    void unknownStoreSkuOrReservationIsNotFound() throws Exception {
        reserve("order-7", "XYZ99", Map.of(RUNNER_9_5, 1)).andExpect(status().isNotFound());
        reserve("order-8", "IND01", Map.of("NOPE-000", 1)).andExpect(status().isNotFound());
        mvc.perform(get("/api/reservations/{id}", UUID.randomUUID())).andExpect(status().isNotFound());
    }
}
