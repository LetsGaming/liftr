/**
 * Where every unexpected (500) error goes, beyond the pino log line app.ts's error handler
 * already writes. `report(error, context)` deliberately mirrors `Sentry.captureException(error,
 * { tags: context })`'s shape — today's reporters (DB + file) are the free, no-extra-service
 * option; if this project (or others sharing infra) ever justifies self-hosting something
 * Sentry-compatible (e.g. GlitchTip), adding it is a ~5-line adapter implementing this same
 * interface and pushing it into `buildReporters`' array below, with zero changes to app.ts's call
 * site:
 *
 *   function glitchtipReporter(dsn: string): ErrorReporter {
 *     Sentry.init({ dsn });
 *     return { report: (error, ctx) => { Sentry.captureException(error, { tags: ctx }); } };
 *   }
 */
export interface ErrorReportContext {
  method: string;
  url: string;
  statusCode: number;
}

export interface ErrorReporter {
  report(error: Error, context: ErrorReportContext): void | Promise<void>;
}

/** Fans one error out to every configured reporter. A reporter failing to record the error must
 *  never affect the response already sent to the client — each is isolated and logged via
 *  `onReporterFailure` rather than thrown. */
export async function reportError(
  reporters: ErrorReporter[],
  error: Error,
  context: ErrorReportContext,
  onReporterFailure: (err: unknown) => void,
): Promise<void> {
  await Promise.all(
    reporters.map(async (reporter) => {
      try {
        await reporter.report(error, context);
      } catch (err) {
        onReporterFailure(err);
      }
    }),
  );
}
