package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.PlannerEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface PlannerJpaRepository extends JpaRepository<PlannerEntity, UUID> {}
