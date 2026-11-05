package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.Planner;
import com.tandem.api.domain.model.PlannerBlock;
import com.tandem.api.repo.jpa.entity.PlannerEntity;
import com.tandem.api.service.port.Mutation;
import com.tandem.api.service.port.PlannerRepository;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaPlannerAdapter implements PlannerRepository {
    private final PlannerJpaRepository rows;
    private final EntityManager em;

    public JpaPlannerAdapter(PlannerJpaRepository rows, EntityManager em) {
        this.rows = rows;
        this.em = em;
    }

    @Override
    @Transactional
    public Planner create(UUID tutorId, String title, List<PlannerBlock> blocks) {
        return call(
                () -> {
                    PlannerEntity e = new PlannerEntity();
                    e.ownerTutorId = tutorId;
                    e.title = title;
                    e.blocks = List.copyOf(blocks);
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<Planner> findByTutorId(UUID tutorId) {
        return call(() -> rows.findById(tutorId).map(EntityMapper::map));
    }

    @Override
    @Transactional
    public Mutation replace(
            UUID tutorId, Instant expectedUpdatedAt, String title, List<PlannerBlock> blocks) {
        Objects.requireNonNull(expectedUpdatedAt, "expectedUpdatedAt");
        return call(
                () -> {
                    PlannerEntity e = LockedRows.find(em, PlannerEntity.class, tutorId);
                    if (e == null) return NOT_FOUND;
                    if (!e.updatedAt.equals(expectedUpdatedAt)) return CONFLICT;
                    e.title = title;
                    e.blocks = List.copyOf(blocks);
                    e.touch();
                    em.flush();
                    return UPDATED;
                });
    }
}
