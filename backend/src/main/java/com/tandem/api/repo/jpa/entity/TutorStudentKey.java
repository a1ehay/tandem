package com.tandem.api.repo.jpa.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class TutorStudentKey implements Serializable {
    @Column(name = "tutor_id")
    public UUID tutorId;

    @Column(name = "student_id")
    public UUID studentId;

    public TutorStudentKey() {}

    public TutorStudentKey(UUID tutorId, UUID studentId) {
        this.tutorId = tutorId;
        this.studentId = studentId;
    }

    @Override
    public boolean equals(Object value) {
        return value instanceof TutorStudentKey other
                && Objects.equals(tutorId, other.tutorId)
                && Objects.equals(studentId, other.studentId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(tutorId, studentId);
    }
}
