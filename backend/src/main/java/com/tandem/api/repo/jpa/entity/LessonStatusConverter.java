package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.LessonStatus;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Locale;

@Converter
public class LessonStatusConverter implements AttributeConverter<LessonStatus, String> {
    public String convertToDatabaseColumn(LessonStatus value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }

    public LessonStatus convertToEntityAttribute(String value) {
        return value == null ? null : LessonStatus.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
