package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.PlanCode;
import com.tandem.api.domain.model.SubscriptionStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tutor_subscriptions")
public class TutorSubscriptionEntity extends TimedEntity {
    @Id
    @Column(name = "tutor_id")
    public UUID tutorId;

    @Column(name = "plan_code", columnDefinition = "text")
    @Convert(converter = PlanCodeConverter.class)
    public PlanCode planCode;

    @Column(name = "status", columnDefinition = "text")
    @Convert(converter = SubscriptionStatusConverter.class)
    public SubscriptionStatus status;

    @Column(name = "period_ends_at")
    public Instant periodEndsAt;
}
