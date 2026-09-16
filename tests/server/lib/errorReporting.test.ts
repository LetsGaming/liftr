import { describe, expect, it, vi } from "vitest";
import { reportError, type ErrorReporter } from "~server/lib/errorReporting.js";

const ctx = { method: "GET", url: "/api/x", statusCode: 500 };

describe("reportError", () => {
  it("calls every reporter", async () => {
    const a: ErrorReporter = { report: vi.fn() };
    const b: ErrorReporter = { report: vi.fn() };
    const error = new Error("boom");
    await reportError([a, b], error, ctx, vi.fn());
    expect(a.report).toHaveBeenCalledWith(error, ctx);
    expect(b.report).toHaveBeenCalledWith(error, ctx);
  });

  it("isolates one reporter's failure — the rest still run, and it's surfaced via onReporterFailure, not thrown", async () => {
    const failing: ErrorReporter = { report: vi.fn().mockRejectedValue(new Error("disk full")) };
    const healthy: ErrorReporter = { report: vi.fn() };
    const onFailure = vi.fn();
    await expect(reportError([failing, healthy], new Error("boom"), ctx, onFailure)).resolves.toBeUndefined();
    expect(healthy.report).toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error));
  });
});
