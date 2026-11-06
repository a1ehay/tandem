package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record BoardSummary(UUID id, UUID ownerTutorId, String name, Instant updatedAt) {}
