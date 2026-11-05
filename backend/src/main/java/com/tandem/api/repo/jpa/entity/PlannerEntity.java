package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.PlannerBlock;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "planners")
public class PlannerEntity extends TimedEntity {
    @Id
    @Column(name = "owner_tutor_id")
    public UUID ownerTutorId;

    @Column(name = "title", columnDefinition = "text")
    public String title;

    @Column(name = "blocks", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    public List<PlannerBlock> blocks;
}
