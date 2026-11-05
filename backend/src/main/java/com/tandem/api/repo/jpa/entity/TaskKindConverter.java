package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.TaskKind;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Locale;

@Converter
public class TaskKindConverter implements AttributeConverter<TaskKind, String> {
    public String convertToDatabaseColumn(TaskKind value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }

    public TaskKind convertToEntityAttribute(String value) {
        return value == null ? null : TaskKind.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
