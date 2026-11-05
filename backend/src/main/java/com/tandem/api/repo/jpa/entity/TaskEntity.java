package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.TaskKind;
import com.tandem.api.domain.model.TaskStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tasks")
public class TaskEntity extends TimedEntity {
    @Id
    @Column(name = "id")
    public UUID id;

    @Column(name = "tutor_id")
    public UUID tutorId;

    @Column(name = "student_id")
    public UUID studentId;

    @Column(name = "kind", columnDefinition = "text")
    @Convert(converter = TaskKindConverter.class)
    public TaskKind kind;

    @Column(name = "title", columnDefinition = "text")
    public String title;

    @Column(name = "description", columnDefinition = "text")
    public String description;

    @Column(name = "subject", columnDefinition = "text")
    public String subject;

    @Column(name = "due_at")
    public Instant dueAt;

    @Column(name = "status", columnDefinition = "text")
    @Convert(converter = TaskStatusConverter.class)
    public TaskStatus status;
}
