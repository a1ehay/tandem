package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.BoardElement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "boards")
public class BoardEntity extends TimedEntity {
    @Id
    @Column(name = "id")
    public UUID id;

    @Column(name = "owner_tutor_id")
    public UUID ownerTutorId;

    @Column(name = "name", columnDefinition = "text")
    public String name;

    @Column(name = "elements", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    public List<BoardElement> elements;
}
