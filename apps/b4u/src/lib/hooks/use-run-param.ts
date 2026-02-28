"use client";

import { parseAsString, useQueryState } from "nuqs";

export function useRunParam() {
  const [runId, setRunId] = useQueryState("run", parseAsString);

  return {
    initialRunId: runId,
    setRunId,
  };
}
