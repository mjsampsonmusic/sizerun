package com.sizerun.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Runs the whole app against a real PostgreSQL database, migrated by Flyway on startup. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTest {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected JdbcTemplate jdbc;

    @BeforeEach
    void clearReservations() {
        jdbc.update("DELETE FROM reservation_line");
        jdbc.update("DELETE FROM reservation");
    }

    protected void setStock(String storeCode, String sku, int quantity) {
        int updated = jdbc.update(
                "UPDATE stock SET quantity = ? WHERE sku = ? AND store_id = (SELECT id FROM store WHERE code = ?)",
                quantity, sku, storeCode);
        assertThat(updated).isEqualTo(1);
    }

    protected int stockOf(String storeCode, String sku) {
        Integer quantity = jdbc.queryForObject(
                "SELECT quantity FROM stock WHERE sku = ? AND store_id = (SELECT id FROM store WHERE code = ?)",
                Integer.class, sku, storeCode);
        assertThat(quantity).isNotNull();
        return quantity;
    }
}
