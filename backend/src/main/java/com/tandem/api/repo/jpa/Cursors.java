package com.tandem.api.repo.jpa;

import com.tandem.api.service.port.InvalidCursorException;
import com.tandem.api.service.port.PageRequest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/** Internal keyset cursor; binds position to the entire query/filter scope. */
final class Cursors {
    record Position(Instant time, UUID id) {}

    private Cursors() {}

    static Position read(PageRequest request, String scope) {
        return read(request, scope, false);
    }

    static Position read(PageRequest request, String scope, boolean nullableTime) {
        if (request.cursor() == null) return null;
        try {
            String[] parts =
                    new String(
                                    Base64.getUrlDecoder().decode(request.cursor()),
                                    StandardCharsets.UTF_8)
                            .split("\n", -1);
            if (parts.length != 3 || !parts[0].equals(hash(scope)))
                throw new IllegalArgumentException();
            Instant time = parts[1].equals("null") ? null : Instant.parse(parts[1]);
            if (time == null && !nullableTime)
                throw new IllegalArgumentException("missing sort timestamp");
            return new Position(time, UUID.fromString(parts[2]));
        } catch (RuntimeException failure) {
            throw new InvalidCursorException(failure);
        }
    }

    static String next(String scope, Instant time, UUID id) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(
                        (hash(scope) + "\n" + time + "\n" + id).getBytes(StandardCharsets.UTF_8));
    }

    private static String hash(String scope) {
        try {
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(scope.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
