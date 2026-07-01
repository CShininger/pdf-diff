package com.pdfdiff.common;

import java.util.Set;

public final class AppConstants {

    private AppConstants() {
    }

    public static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "application/pdf",
            "application/octet-stream"
    );

    public static final Set<String> PDF_CONTENT_TYPES = Set.of("application/pdf");

    public static final String BACKEND_FRONTEND = "frontend";
}
