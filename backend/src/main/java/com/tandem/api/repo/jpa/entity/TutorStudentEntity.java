package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.LinkStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "tutor_students")
public class TutorStudentEntity extends TimedEntity {
    @EmbeddedId public TutorStudentKey id;

    @Column(name = "subject", columnDefinition = "text")
    public String subject;

    @Column(name = "grade_label", columnDefinition = "text")
    public String gradeLabel;

    @Column(name = "private_note", columnDefinition = "text")
    public String privateNote;

    @Column(name = "progress_percent")
    public short progressPercent;

    @Column(name = "status", columnDefinition = "text")
    @Convert(converter = LinkStatusConverter.class)
    public LinkStatus status;
}
