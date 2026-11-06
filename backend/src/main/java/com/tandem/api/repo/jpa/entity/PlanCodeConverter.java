package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.PlanCode;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Locale;

@Converter
public class PlanCodeConverter implements AttributeConverter<PlanCode, String> {
    public String convertToDatabaseColumn(PlanCode value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }

    public PlanCode convertToEntityAttribute(String value) {
        return value == null ? null : PlanCode.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
