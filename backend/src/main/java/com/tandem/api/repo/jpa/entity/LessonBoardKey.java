package com.tandem.api.repo.jpa.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class LessonBoardKey implements Serializable {
    @Column(name = "lesson_id")
    public UUID lessonId;

    @Column(name = "board_id")
    public UUID boardId;

    public LessonBoardKey() {}

    public LessonBoardKey(UUID lessonId, UUID boardId) {
        this.lessonId = lessonId;
        this.boardId = boardId;
    }

    @Override
    public boolean equals(Object value) {
        return value instanceof LessonBoardKey other
                && Objects.equals(lessonId, other.lessonId)
                && Objects.equals(boardId, other.boardId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(lessonId, boardId);
    }
}
