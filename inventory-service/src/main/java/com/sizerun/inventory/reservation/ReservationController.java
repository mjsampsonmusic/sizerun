package com.sizerun.inventory.reservation;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal API: only the order service calls it. The web app never reaches these routes. */
@RestController
@RequestMapping("/api/reservations")
public class ReservationController {

    private final ReservationService reservations;

    public ReservationController(ReservationService reservations) {
        this.reservations = reservations;
    }

    /** 201 for a new reservation, 200 when the same order asks again, 409 when a size is short. */
    @PostMapping
    public ResponseEntity<ReservationView> reserve(@Valid @RequestBody ReserveRequest request) {
        try {
            ReservationService.ReserveResult result = reservations.reserve(request);
            HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
            return ResponseEntity.status(status).body(result.reservation());
        } catch (DataIntegrityViolationException duplicate) {
            // Two requests for the same order raced and this one lost on the unique order_ref index.
            return reservations.findByOrderRef(request.orderRef())
                    .map(ResponseEntity::ok)
                    .orElseThrow(() -> duplicate);
        }
    }

    @GetMapping("/{id}")
    public ReservationView get(@PathVariable("id") UUID id) {
        return reservations.get(id);
    }

    @PostMapping("/{id}/release")
    public ReservationView release(@PathVariable("id") UUID id) {
        return reservations.release(id);
    }
}
