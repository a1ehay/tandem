package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.TutorSubscriptionEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface TutorSubscriptionJpaRepository extends JpaRepository<TutorSubscriptionEntity, UUID> {}
