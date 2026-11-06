package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.StudentProfile;
import com.tandem.api.repo.jpa.entity.StudentProfileEntity;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.StudentProfileRepository;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaStudentProfileAdapter implements StudentProfileRepository {
    private final StudentProfileJpaRepository rows;
    private final EntityManager em;

    public JpaStudentProfileAdapter(StudentProfileJpaRepository rows, EntityManager em) {
        this.rows = rows;
        this.em = em;
    }

    @Override
    @Transactional
    public StudentProfile create(UUID userId, String gradeLabel) {
        return call(
                () -> {
                    StudentProfileEntity e = new StudentProfileEntity();
                    e.userId = userId;
                    e.gradeLabel = gradeLabel;
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<StudentProfile> findByUserId(UUID id) {
        return call(() -> rows.findById(id).map(EntityMapper::map));
    }

    @Override
    @Transactional
    public Mutation updateGrade(UUID id, String gradeLabel) {
        return call(
                () -> {
                    StudentProfileEntity e = LockedRows.find(em, StudentProfileEntity.class, id);
                    if (e == null) return NOT_FOUND;
                    e.gradeLabel = gradeLabel;
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }
}
