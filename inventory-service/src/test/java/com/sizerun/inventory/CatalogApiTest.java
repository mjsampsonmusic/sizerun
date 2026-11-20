package com.sizerun.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

class CatalogApiTest extends IntegrationTest {

    @Test
    void listsEveryStoreInCodeOrder() throws Exception {
        mvc.perform(get("/api/stores"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].code").value("CHI01"))
                .andExpect(jsonPath("$[1].code").value("IND01"))
                .andExpect(jsonPath("$[2].code").value("NYC01"));
    }

    @Test
    void catalogShowsEachStylesFullSizeRunWithLiveStock() throws Exception {
        setStock("IND01", "RUN1-NVY-095", 4);

        String body = mvc.perform(get("/api/stores/IND01/catalog"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode styles = json.readTree(body);

        assertThat(styles.size()).isEqualTo(4);
        JsonNode runner = styles.get(1);
        assertThat(runner.get("styleCode").asText()).isEqualTo("RUN1-NVY");
        assertThat(runner.get("priceCents").asInt()).isEqualTo(13000);

        JsonNode sizes = runner.get("sizes");
        assertThat(sizes.size()).isEqualTo(13);
        assertThat(sizes.get(0).get("size").asText()).isEqualTo("7");
        assertThat(sizes.get(12).get("size").asText()).isEqualTo("13");

        JsonNode nineAndAHalf = sizes.get(5);
        assertThat(nineAndAHalf.get("size").asText()).isEqualTo("9.5");
        assertThat(nineAndAHalf.get("sku").asText()).isEqualTo("RUN1-NVY-095");
        assertThat(nineAndAHalf.get("available").asInt()).isEqualTo(4);
    }

    @Test
    void unknownStoreIsNotFound() throws Exception {
        mvc.perform(get("/api/stores/XYZ99/catalog"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }
}
