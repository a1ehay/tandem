package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record LessonBoard(UUID lessonId, UUID boardId, Instant attachedAt) {}
