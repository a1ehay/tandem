package com.tandem.api.service.port;

import com.tandem.api.domain.model.Task;
import com.tandem.api.domain.model.TaskKind;
import com.tandem.api.domain.model.TaskStatus;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface TaskRepository {
    Task create(
            UUID tutorId,
            UUID studentId,
            TaskKind kind,
            String title,
            String description,
            String subject,
            Instant dueAt);

    Optional<Task> findById(UUID id);

    CursorPage<Task> list(TaskFilter filter, PageRequest page);

    Mutation updateContent(
            UUID id, UUID tutorId, String title, String description, String subject, Instant dueAt);

    Mutation changeStatus(UUID id, TaskStatus expected, TaskStatus next);
}
