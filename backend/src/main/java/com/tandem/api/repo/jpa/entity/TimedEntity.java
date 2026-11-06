package com.tandem.api.repo.jpa.entity;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@MappedSuperclass
public abstract class TimedEntity {
    @Column(name = "created_at", nullable = false, updatable = false)
    public Instant createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt = createdAt;

    /** Call while holding the row write lock. PostgreSQL stores microsecond precision. */
    public void touch() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plus(1, ChronoUnit.MICROS);
    }
}
