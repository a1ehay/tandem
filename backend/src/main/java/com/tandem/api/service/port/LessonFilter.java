package com.tandem.api.service.port;

import com.tandem.api.domain.model.LessonStatus;

import java.time.Instant;
import java.util.UUID;

/** At least one participant scope is required; a tutor may additionally filter a student. */
public record LessonFilter(
        UUID tutorId, UUID studentId, Instant from, Instant to, LessonStatus status) {
    public LessonFilter {
        if (tutorId == null && studentId == null)
            throw new IllegalArgumentException("participant scope is required");
        if (from != null && to != null && !from.isBefore(to))
            throw new IllegalArgumentException("invalid time range");
    }
}
