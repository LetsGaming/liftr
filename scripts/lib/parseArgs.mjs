/** Shared by dev-up.mjs and dev-down.mjs: parses `--id <name>` (default "default"), validated to
 *  alphanumeric/dash/underscore only since it's used to namespace filesystem paths. Also parses
 *  `--verbose` (dev-up.mjs only) for restoring full per-request server logging — the default is
 *  muted (see app.ts's LIFTR_LOG_VERBOSE handling) so a seed/dev run doesn't bloat the log file
 *  with a line per request — and `--fresh` (dev-up.mjs only) to bypass the seed cache (see
 *  scripts/lib/seedCache.mjs) and force a full reseed even on a cache hit. */
export function parseArgs(argv) {
  const args = { id: "default", verbose: false, fresh: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id" && argv[i + 1] !== undefined) args.id = argv[++i];
    else if (argv[i] === "--verbose") args.verbose = true;
    else if (argv[i] === "--fresh") args.fresh = true;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(args.id)) {
    throw new Error(`--id must be alphanumeric/dash/underscore only, got: ${args.id}`);
  }
  return args;
}
