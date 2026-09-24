import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";
import { useSparklinePoints } from "~client/composables/useSparklinePoints";

describe("useSparklinePoints", () => {
  it("returns an empty string for fewer than 2 points", () => {
    expect(useSparklinePoints(ref([])).points.value).toBe("");
    expect(useSparklinePoints(ref([5])).points.value).toBe("");
  });

  it("maps the min value to the bottom edge and the max value to the top edge", () => {
    const { points } = useSparklinePoints(ref([0, 10]), { width: 100, height: 50, pad: 0 });
    const [first, second] = points.value.split(" ");
    const [, firstY] = first!.split(",").map(Number);
    const [, secondY] = second!.split(",").map(Number);
    expect(firstY).toBe(50); // min value sits at the bottom (SVG y grows downward)
    expect(secondY).toBe(0); // max value sits at the top
  });

  it("spaces x coordinates evenly across the width", () => {
    const { points } = useSparklinePoints(ref([1, 2, 3]), { width: 90, height: 10, pad: 0 });
    const xs = points.value.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs).toEqual([0, 45, 90]);
  });

  it("does not divide by zero when every value is identical", () => {
    const { points } = useSparklinePoints(ref([7, 7, 7]));
    expect(points.value.split(" ")).toHaveLength(3);
    expect(points.value).not.toContain("NaN");
  });

  it("stays reactive to the source ref", () => {
    const values = ref([1, 2]);
    const { points } = useSparklinePoints(values);
    const before = points.value;
    values.value = [1, 2, 3];
    expect(points.value).not.toBe(before);
    expect(points.value.split(" ")).toHaveLength(3);
  });

  it("recomputes when given a computed ref derived from other state", () => {
    const source = ref([{ v: 1 }, { v: 2 }]);
    const { points } = useSparklinePoints(computed(() => source.value.map((d) => d.v)));
    const before = points.value;
    source.value = [{ v: 1 }, { v: 2 }, { v: 3 }];
    expect(points.value).not.toBe(before);
  });
});
