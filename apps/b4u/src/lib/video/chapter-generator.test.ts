import { describe, expect, it } from "vitest";
import { generateChapters } from "@/lib/video/chapter-generator";

describe("generateChapters", () => {
  it("generates chapters with cumulative start times", () => {
    const recordings = [
      { flowId: "f1", flowName: "Onboarding", durationSeconds: 30 },
      { flowId: "f2", flowName: "Dashboard", durationSeconds: 45 },
      { flowId: "f3", flowName: "Settings", durationSeconds: 20 },
    ];

    const chapters = generateChapters(recordings);

    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toEqual({ flowName: "Onboarding", startTime: "0:00", startSeconds: 0 });
    expect(chapters[1]).toEqual({ flowName: "Dashboard", startTime: "0:30", startSeconds: 30 });
    expect(chapters[2]).toEqual({ flowName: "Settings", startTime: "1:15", startSeconds: 75 });
  });

  it("returns empty array for empty input", () => {
    expect(generateChapters([])).toEqual([]);
  });

  it("handles a single recording", () => {
    const chapters = generateChapters([{ flowId: "f1", flowName: "Intro", durationSeconds: 60 }]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toEqual({ flowName: "Intro", startTime: "0:00", startSeconds: 0 });
  });

  it("formats timestamps with zero-padded seconds", () => {
    const chapters = generateChapters([
      { flowId: "f1", flowName: "A", durationSeconds: 5 },
      { flowId: "f2", flowName: "B", durationSeconds: 10 },
    ]);
    expect(chapters[0].startTime).toBe("0:00");
    expect(chapters[1].startTime).toBe("0:05");
  });

  it("handles large durations correctly", () => {
    const chapters = generateChapters([
      { flowId: "f1", flowName: "Long", durationSeconds: 3600 },
      { flowId: "f2", flowName: "After", durationSeconds: 10 },
    ]);
    expect(chapters[1].startTime).toBe("60:00");
    expect(chapters[1].startSeconds).toBe(3600);
  });

  it("handles fractional seconds by flooring", () => {
    const chapters = generateChapters([
      { flowId: "f1", flowName: "A", durationSeconds: 10.7 },
      { flowId: "f2", flowName: "B", durationSeconds: 5 },
    ]);
    expect(chapters[1].startTime).toBe("0:10");
    expect(chapters[1].startSeconds).toBe(10.7);
  });
});
