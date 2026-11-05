package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record StudentProfile(
        UUID userId, String gradeLabel, Instant createdAt, Instant updatedAt) {}
