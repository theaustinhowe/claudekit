interface Recording {
  flowId: string;
  flowName: string;
  durationSeconds: number;
}

interface Chapter {
  flowName: string;
  startTime: string;
  startSeconds: number;
}

export function generateChapters(recordings: Recording[]): Chapter[] {
  let currentTime = 0;
  return recordings.map((rec) => {
    const chapter: Chapter = {
      flowName: rec.flowName,
      startTime: formatTimestamp(currentTime),
      startSeconds: currentTime,
    };
    currentTime += rec.durationSeconds;
    return chapter;
  });
}

function formatTimestamp(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function getTotalDuration(recordings: Recording[]): number {
  return recordings.reduce((sum, r) => sum + r.durationSeconds, 0);
}
