package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record Planner(
        UUID ownerTutorId,
        String title,
        List<PlannerBlock> blocks,
        Instant createdAt,
        Instant updatedAt) {
    public Planner {
        blocks = blocks == null ? List.of() : List.copyOf(blocks);
    }
}
