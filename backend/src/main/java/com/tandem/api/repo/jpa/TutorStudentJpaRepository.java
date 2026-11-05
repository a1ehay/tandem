package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.TutorStudentEntity;
import com.tandem.api.repo.jpa.entity.TutorStudentKey;

import org.springframework.data.jpa.repository.JpaRepository;

interface TutorStudentJpaRepository extends JpaRepository<TutorStudentEntity, TutorStudentKey> {}
