package com.sizerun.inventory.web;

import com.sizerun.inventory.reservation.InsufficientStockException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns domain errors into RFC 9457 problem responses (application/problem+json). Validation and
 * malformed-JSON errors are handled by Spring Boot's built-in problem details support.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail notFound(NotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setTitle("Not found");
        problem.setProperty("code", "NOT_FOUND");
        return problem;
    }

    @ExceptionHandler(InsufficientStockException.class)
    public ProblemDetail insufficientStock(InsufficientStockException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        problem.setTitle("Insufficient stock");
        problem.setProperty("code", "INSUFFICIENT_STOCK");
        problem.setProperty("sku", ex.getSku());
        problem.setProperty("requested", ex.getRequested());
        problem.setProperty("available", ex.getAvailable());
        return problem;
    }
}
