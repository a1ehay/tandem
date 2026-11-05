package com.tandem.api.repo.jpa;

import com.tandem.api.repo.jpa.entity.BoardEntity;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

interface BoardJpaRepository extends JpaRepository<BoardEntity, UUID> {}
