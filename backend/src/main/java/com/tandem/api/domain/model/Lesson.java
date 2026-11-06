package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record Lesson(
        UUID id,
        UUID tutorId,
        UUID studentId,
        String title,
        Instant startsAt,
        short durationMinutes,
        LessonStatus status,
        Instant createdAt,
        Instant updatedAt) {}
