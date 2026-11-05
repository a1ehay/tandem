package com.tandem.api.service.port;

import com.tandem.api.domain.model.TaskKind;
import com.tandem.api.domain.model.TaskStatus;

import java.time.Instant;
import java.util.UUID;

public record TaskFilter(
        UUID tutorId, UUID studentId, TaskKind kind, TaskStatus status, Instant dueBefore) {
    public TaskFilter {
        if (tutorId == null && studentId == null)
            throw new IllegalArgumentException("participant scope is required");
    }
}
