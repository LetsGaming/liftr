import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import RecordsPage from "~client/pages/RecordsPage.vue";
import { mountWithProviders } from "../../helpers/mountWithProviders";

// Plain top-of-file const (not vi.hoisted — `reactive` isn't available inside that factory, see
// RunsPage.test.ts's comment) referenced only inside an uninvoked closure below, so vi.mock's own
// hoisting above this declaration never dereferences it before it exists.
const prState = reactive({ prs: [] as unknown[], loaded: false, error: false, load: vi.fn() });

vi.mock("~client/stores/prStore", () => ({
  usePrStore: () => prState,
}));

function makePr(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pr1",
    exerciseSlug: "bench-press",
    exerciseName: null,
    kind: "weight",
    value: 100,
    achievedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("RecordsPage", () => {
  it("loads the PR list on mount", () => {
    mountWithProviders(RecordsPage);
    expect(prState.load).toHaveBeenCalledOnce();
  });

  it("shows loading skeletons while prStore hasn't loaded yet", () => {
    Object.assign(prState, { prs: [], loaded: false, error: false });
    const wrapper = mountWithProviders(RecordsPage);

    expect(wrapper.findAll(".pr-skel-row")).toHaveLength(4);
    expect(wrapper.find(".pr-list").exists()).toBe(false);
  });

  it("shows a retry banner when the load failed", async () => {
    Object.assign(prState, { prs: [], loaded: false, error: true });
    const wrapper = mountWithProviders(RecordsPage);

    expect(wrapper.text()).toContain("Rekorde konnten nicht geladen werden.");
    prState.load.mockClear();
    await wrapper.find(".load-error button").trigger("click");
    expect(prState.load).toHaveBeenCalledOnce();
  });

  it("shows the honest empty state once loaded with zero records", () => {
    Object.assign(prState, { prs: [], loaded: true, error: false });
    const wrapper = mountWithProviders(RecordsPage);

    expect(wrapper.text()).toContain("Noch keine Rekorde");
    expect(wrapper.find(".pr-list").exists()).toBe(false);
  });

  it("renders every PR sorted newest-first, formatted per kind, with a reward highlight for recent ones", () => {
    Object.assign(prState, {
      loaded: true,
      error: false,
      prs: [
        makePr({ id: "old", kind: "reps", value: 12.4, achievedAt: "2020-01-01T00:00:00.000Z" }),
        makePr({ id: "recent", kind: "e1rm", value: 126.6666, achievedAt: new Date().toISOString() }),
      ],
    });
    const wrapper = mountWithProviders(RecordsPage);

    const rows = wrapper.findAll(".pr-row");
    expect(rows).toHaveLength(2);
    // Newest (recent, e1rm) sorts first.
    expect(rows[0]!.text()).toContain("127 kg");
    expect(rows[0]!.classes()).toContain("panel-reward");
    expect(rows[1]!.text()).toContain("12 Wdh.");
    expect(rows[1]!.classes()).not.toContain("panel-reward");
  });
});
