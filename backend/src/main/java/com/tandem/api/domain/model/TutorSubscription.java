package com.tandem.api.domain.model;

import java.time.Instant;
import java.util.UUID;

public record TutorSubscription(
        UUID tutorId,
        PlanCode planCode,
        SubscriptionStatus status,
        Instant periodEndsAt,
        Instant createdAt,
        Instant updatedAt) {}
