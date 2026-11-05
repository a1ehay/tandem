package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.TaskEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface TaskJpaRepository extends JpaRepository<TaskEntity, UUID> {}
