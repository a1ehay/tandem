package com.tandem.api.service.port;

import com.tandem.api.domain.model.LinkStatus;
import com.tandem.api.domain.model.TutorStudent;

import java.util.Optional;
import java.util.UUID;

public interface TutorStudentRepository {
    TutorStudent create(
            UUID tutorId, UUID studentId, String subject, String gradeLabel, String privateNote);

    Optional<TutorStudent> find(UUID tutorId, UUID studentId);

    CursorPage<TutorStudent> list(UUID tutorId, LinkStatus status, PageRequest page);

    Mutation update(
            UUID tutorId,
            UUID studentId,
            String subject,
            String gradeLabel,
            String privateNote,
            short progressPercent,
            LinkStatus status);
}
