package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record Board(
        UUID id,
        UUID ownerTutorId,
        String name,
        List<BoardElement> elements,
        Instant createdAt,
        Instant updatedAt) {
    public Board {
        elements = elements == null ? List.of() : List.copyOf(elements);
    }
}
