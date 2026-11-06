package com.tandem.api.domain.model;

import java.util.List;

public record BoardElement(
        String id,
        BoardElementType type,
        String color,
        Double width,
        List<Point> points,
        Double x1,
        Double y1,
        Double x2,
        Double y2,
        Double x,
        Double y,
        Double w,
        Double h,
        String text,
        String fill,
        Double fontSize) {
    public BoardElement {
        points = points == null ? List.of() : List.copyOf(points);
    }
}
