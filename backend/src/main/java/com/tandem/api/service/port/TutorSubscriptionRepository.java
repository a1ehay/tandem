package com.tandem.api.service.port;

import com.tandem.api.domain.model.PlanCode;
import com.tandem.api.domain.model.SubscriptionStatus;
import com.tandem.api.domain.model.TutorSubscription;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface TutorSubscriptionRepository {
    TutorSubscription createInitial(
            UUID tutorId, PlanCode planCode, SubscriptionStatus status, Instant periodEndsAt);

    Optional<TutorSubscription> findByTutorId(UUID tutorId);
}
