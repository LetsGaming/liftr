/** Shared by dev-up.mjs and dev-down.mjs: parses `--id <name>` (default "default"), validated to
 *  alphanumeric/dash/underscore only since it's used to namespace filesystem paths. */
export function parseArgs(argv) {
  const args = { id: "default" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id" && argv[i + 1] !== undefined) args.id = argv[++i];
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(args.id)) {
    throw new Error(`--id must be alphanumeric/dash/underscore only, got: ${args.id}`);
  }
  return args;
}
