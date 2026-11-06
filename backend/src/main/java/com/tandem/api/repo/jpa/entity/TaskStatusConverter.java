package com.tandem.api.repo.jpa.entity;

import com.tandem.api.domain.model.TaskStatus;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Locale;

@Converter
public class TaskStatusConverter implements AttributeConverter<TaskStatus, String> {
    public String convertToDatabaseColumn(TaskStatus value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }

    public TaskStatus convertToEntityAttribute(String value) {
        return value == null ? null : TaskStatus.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
