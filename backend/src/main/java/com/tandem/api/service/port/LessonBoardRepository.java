package com.tandem.api.service.port;

import com.tandem.api.domain.model.LessonBoard;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public interface LessonBoardRepository {
    List<LessonBoard> findByLessonId(UUID lessonId);

    /** At most 100 lesson IDs; keys without attachments are omitted. */
    Map<UUID, List<LessonBoard>> findByLessonIds(Set<UUID> lessonIds);

    LessonBoard attach(UUID lessonId, UUID boardId);

    boolean detach(UUID lessonId, UUID boardId);
}
