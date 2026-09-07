import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { api } from "~client/lib/api";
import {
  getGymSetup,
  getOwnedEquipment,
  getProfile,
  saveGymSetup,
  saveOwnedEquipment,
  saveProfile,
  type GymSetup,
  type ProfileInput,
} from "~client/services/settingsService";

const mockGet = vi.mocked(api.get);
const mockPut = vi.mocked(api.put);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProfile", () => {
  it("GETs /api/settings/profile and returns the parsed profile", async () => {
    const body = { sex: "male" as const, experienceLevel: "intermediate" as const };
    mockGet.mockResolvedValue(body);

    const result = await getProfile();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/settings/profile");
    expect(result).toBe(body);
  });

  it("passes through null when the server has no profile yet", async () => {
    mockGet.mockResolvedValue(null);

    const result = await getProfile();

    expect(result).toBeNull();
  });
});

describe("saveProfile", () => {
  it("PUTs the profile input (including the write-only currentWeightKg field)", async () => {
    const input: ProfileInput = { sex: "female", experienceLevel: "beginner", currentWeightKg: 62.5 };
    const saved = { sex: "female" as const, experienceLevel: "beginner" as const };
    mockPut.mockResolvedValue(saved);

    const result = await saveProfile(input);

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith("/api/settings/profile", input);
    expect(result).toBe(saved);
  });
});

describe("getOwnedEquipment", () => {
  it("GETs /api/settings/equipment and unwraps the { equipment } envelope", async () => {
    mockGet.mockResolvedValue({ equipment: ["barbell", "dumbbell"] });

    const result = await getOwnedEquipment();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/settings/equipment");
    expect(result).toEqual(["barbell", "dumbbell"]);
  });

  it("returns null when the server hasn't stored equipment yet", async () => {
    mockGet.mockResolvedValue({ equipment: null });

    const result = await getOwnedEquipment();

    expect(result).toBeNull();
  });
});

describe("saveOwnedEquipment", () => {
  it("PUTs the equipment list wrapped in { equipment }", async () => {
    const equipment = ["barbell", "kettlebell"];
    mockPut.mockResolvedValue({ equipment });

    const result = await saveOwnedEquipment(equipment);

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith("/api/settings/equipment", { equipment });
    expect(result).toEqual({ equipment });
  });
});

describe("getGymSetup", () => {
  it("GETs /api/settings/gym and returns the parsed setup", async () => {
    const body: GymSetup = { barWeights: { barbell: 20 }, plates: [{ weightKg: 20, count: 4 }] };
    mockGet.mockResolvedValue(body);

    const result = await getGymSetup();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/settings/gym");
    expect(result).toBe(body);
  });

  it("passes through null when no gym setup is saved yet", async () => {
    mockGet.mockResolvedValue(null);

    const result = await getGymSetup();

    expect(result).toBeNull();
  });
});

describe("saveGymSetup", () => {
  it("PUTs the gym setup as-is", async () => {
    const input: GymSetup = { barWeights: { dumbbell: 2.5 }, plates: [] };
    mockPut.mockResolvedValue(input);

    const result = await saveGymSetup(input);

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith("/api/settings/gym", input);
    expect(result).toBe(input);
  });
});
