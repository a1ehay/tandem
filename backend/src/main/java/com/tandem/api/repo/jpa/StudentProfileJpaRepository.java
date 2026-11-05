package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.StudentProfileEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface StudentProfileJpaRepository extends JpaRepository<StudentProfileEntity, UUID> {}
