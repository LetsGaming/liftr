/**
 * Exercise slug shape — the natural-key convention every catalog entry already follows (e.g.
 * "bench-press", "close-grip-pushup"), used as a URL/filesystem path segment
 * (`images/<slug>/start.jpg`) in `routes/exercises.ts`. Shared so the custom-exercise creation
 * schema can reject anything that doesn't match instead of trusting client input verbatim —
 * lowercase alnum segments joined by single hyphens, no leading/trailing hyphen, no `.`/`/`
 * (which would otherwise let a crafted slug walk outside `imagesRoot` when joined into a path).
 */
export const EXERCISE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
