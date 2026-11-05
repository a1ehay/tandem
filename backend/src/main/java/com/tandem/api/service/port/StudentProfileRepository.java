package com.tandem.api.service.port;

import com.tandem.api.domain.model.StudentProfile;

import java.util.Optional;
import java.util.UUID;

public interface StudentProfileRepository {
    StudentProfile create(UUID userId, String gradeLabel);

    Optional<StudentProfile> findByUserId(UUID userId);

    Mutation updateGrade(UUID userId, String gradeLabel);
}
