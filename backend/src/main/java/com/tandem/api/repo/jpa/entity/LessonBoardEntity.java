package com.tandem.api.repo.jpa.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "lesson_boards")
public class LessonBoardEntity {
    @EmbeddedId public LessonBoardKey id;

    @Column(name = "attached_at")
    public Instant attachedAt;
}
