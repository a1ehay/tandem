package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record User(
        UUID id,
        String email,
        String displayName,
        UserRole role,
        Instant createdAt,
        Instant updatedAt) {}
