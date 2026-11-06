package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record Task(
        UUID id,
        UUID tutorId,
        UUID studentId,
        TaskKind kind,
        String title,
        String description,
        String subject,
        Instant dueAt,
        TaskStatus status,
        Instant createdAt,
        Instant updatedAt) {}
