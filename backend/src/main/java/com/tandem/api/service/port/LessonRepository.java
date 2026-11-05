package com.tandem.api.service.port;

import com.tandem.api.domain.model.Lesson;
import com.tandem.api.domain.model.LessonStatus;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface LessonRepository {
    Lesson create(
            UUID tutorId, UUID studentId, String title, Instant startsAt, short durationMinutes);

    Optional<Lesson> findById(UUID id);

    CursorPage<Lesson> list(LessonFilter filter, PageRequest page);

    Mutation updateSchedule(
            UUID id, UUID tutorId, String title, Instant startsAt, short durationMinutes);

    Mutation changeStatus(UUID id, UUID tutorId, LessonStatus expected, LessonStatus next);

    boolean overlaps(UUID tutorId, Instant startsAt, short durationMinutes, UUID excludeId);
}
