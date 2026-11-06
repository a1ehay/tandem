package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.LessonStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "lessons")
public class LessonEntity extends TimedEntity {
    @Id
    @Column(name = "id")
    public UUID id;

    @Column(name = "tutor_id")
    public UUID tutorId;

    @Column(name = "student_id")
    public UUID studentId;

    @Column(name = "title", columnDefinition = "text")
    public String title;

    @Column(name = "starts_at")
    public Instant startsAt;

    @Column(name = "duration_minutes")
    public short durationMinutes;

    @Column(name = "status", columnDefinition = "text")
    @Convert(converter = LessonStatusConverter.class)
    public LessonStatus status;
}
