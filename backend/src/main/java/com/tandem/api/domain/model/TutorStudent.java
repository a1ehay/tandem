package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record TutorStudent(
        UUID tutorId,
        UUID studentId,
        String subject,
        String gradeLabel,
        String privateNote,
        short progressPercent,
        LinkStatus status,
        Instant createdAt,
        Instant updatedAt) {}
