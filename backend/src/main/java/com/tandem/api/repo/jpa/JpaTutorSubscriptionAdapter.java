package com.tandem.api.repo.jpa;

import static com.tandem.api.repo.jpa.PersistenceGuard.call;
import static com.tandem.api.service.port.Mutation.*;

import com.tandem.api.domain.model.PlanCode;
import com.tandem.api.domain.model.SubscriptionStatus;
import com.tandem.api.domain.model.TutorSubscription;
import com.tandem.api.repo.jpa.entity.TutorSubscriptionEntity;
import com.tandem.api.service.port.TutorSubscriptionRepository;

import jakarta.persistence.EntityManager;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
@Transactional(readOnly = true)
public class JpaTutorSubscriptionAdapter implements TutorSubscriptionRepository {
    private final TutorSubscriptionJpaRepository rows;
    private final EntityManager em;

    public JpaTutorSubscriptionAdapter(TutorSubscriptionJpaRepository rows, EntityManager em) {
        this.rows = rows;
        this.em = em;
    }

    @Override
    @Transactional
    public TutorSubscription createInitial(
            UUID tutorId, PlanCode planCode, SubscriptionStatus status, Instant periodEndsAt) {
        return call(
                () -> {
                    TutorSubscriptionEntity e = new TutorSubscriptionEntity();
                    e.tutorId = tutorId;
                    e.planCode = planCode;
                    e.status = status;
                    e.periodEndsAt = periodEndsAt;
                    em.persist(e);
                    em.flush();
                    em.refresh(e);
                    return EntityMapper.map(e);
                });
    }

    @Override
    public Optional<TutorSubscription> findByTutorId(UUID id) {
        return call(() -> rows.findById(id).map(EntityMapper::map));
    }
}
