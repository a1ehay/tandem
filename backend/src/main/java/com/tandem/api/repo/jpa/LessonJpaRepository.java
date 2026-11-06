package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.LessonEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface LessonJpaRepository extends JpaRepository<LessonEntity, UUID> {}
