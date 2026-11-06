package com.tandem.api.repo.jpa.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "student_profiles")
public class StudentProfileEntity extends TimedEntity {
    @Id
    @Column(name = "user_id")
    public UUID userId;

    @Column(name = "grade_label", columnDefinition = "text")
    public String gradeLabel;
}
