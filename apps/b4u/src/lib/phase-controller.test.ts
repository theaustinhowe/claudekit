import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock external modules BEFORE importing the module under test
// ---------------------------------------------------------------------------

// Mock store
const mockDispatch = vi.fn();
const mockState = {
  currentPhase: 1 as const,
  phaseStatuses: {
    1: "active" as const,
    2: "locked" as const,
    3: "locked" as const,
    4: "locked" as const,
    5: "locked" as const,
    6: "locked" as const,
    7: "locked" as const,
  },
  messages: [],
  isTyping: false,
  projectName: "",
  rightPanelContent: null,
  editMode: null,
  projectPath: null,
  activeSessionId: null,
  fileBrowserOpen: false,
  historySidebarOpen: false,
  runId: null,
  panelRefreshKey: 0,
};

vi.mock("./store", () => ({
  useApp: () => ({ state: mockState, dispatch: mockDispatch }),
}));

vi.mock("./utils", () => ({
  delay: () => Promise.resolve(),
  uid: (() => {
    let counter = 0;
    return () => {
      counter += 1;
      return `test-uid-${counter}`;
    };
  })(),
}));

// Mock React hooks
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useCallback: (fn: Function) => fn,
    useRef: (initial: unknown) => ({ current: initial }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockEventSource() {
  let onmessage: ((evt: { data: string }) => void) | null = null;
  let onerror: (() => void) | null = null;
  const instance = {
    close: vi.fn(),
    set onmessage(fn: ((evt: { data: string }) => void) | null) {
      onmessage = fn;
    },
    get onmessage() {
      return onmessage;
    },
    set onerror(fn: (() => void) | null) {
      onerror = fn;
    },
    get onerror() {
      return onerror;
    },
    triggerMessage(data: unknown) {
      onmessage?.({ data: JSON.stringify(data) });
    },
    triggerError() {
      onerror?.();
    },
  };

  (globalThis as unknown as { EventSource: unknown }).EventSource = vi.fn(() => instance);
  return instance;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePhaseController", () => {
  let controller: ReturnType<typeof import("./phase-controller").usePhaseController>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockState.currentPhase = 1;
    mockState.runId = null;
    mockState.projectPath = null;
    mockState.phaseStatuses = {
      1: "active",
      2: "locked",
      3: "locked",
      4: "locked",
      5: "locked",
      6: "locked",
      7: "locked",
    };
    mockState.messages = [];

    globalThis.fetch = mockFetchResponse({});
    (globalThis as unknown as { EventSource: unknown }).EventSource = vi.fn();

    const mod = await import("./phase-controller");
    controller = mod.usePhaseController();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // startPhase1
  // -----------------------------------------------------------------------

  describe("startPhase1", () => {
    it("dispatches welcome messages and sets right panel to phase 1", async () => {
      await controller.startPhase1();

      // Should dispatch SET_TYPING true then false (for addAIMessage), then ADD_MESSAGE
      const typingCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_TYPING",
      );
      expect(typingCalls.length).toBeGreaterThanOrEqual(2);

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      expect(addMsgCalls.length).toBe(2);

      // First AI message is the welcome
      const firstMsg = (addMsgCalls[0][0] as { message: { content: string } }).message;
      expect(firstMsg.content).toContain("Welcome to B4U");

      // Second AI message asks to select project
      const secondMsg = (addMsgCalls[1][0] as { message: { content: string; actionCard?: { type: string } } }).message;
      expect(secondMsg.content).toContain("project folder");
      expect(secondMsg.actionCard?.type).toBe("folder-select");

      // Should set right panel
      const panelCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RIGHT_PANEL",
      );
      expect(panelCalls.length).toBe(1);
      expect((panelCalls[0][0] as { phase: number }).phase).toBe(1);
    });

    it("does not run if already busy", async () => {
      // Start two calls concurrently — the second should be a no-op
      const p1 = controller.startPhase1();
      const p2 = controller.startPhase1();
      await Promise.all([p1, p2]);

      // Only one set of messages should be dispatched (from the first call)
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      expect(addMsgCalls.length).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // handleFolderSelected
  // -----------------------------------------------------------------------

  describe("handleFolderSelected", () => {
    it("sets run ID, project path, dispatches messages", async () => {
      globalThis.fetch = mockFetchResponse({
        name: "my-app",
        framework: "Next.js",
        directories: ["src", "public"],
        auth: "NextAuth",
        database: "PostgreSQL",
        tree: [{ name: "src", type: "directory" }],
      });

      // Mock crypto.randomUUID
      const originalCrypto = globalThis.crypto;
      globalThis.crypto = { ...originalCrypto, randomUUID: () => "test-run-id" } as Crypto;

      await controller.handleFolderSelected("/home/user/project");

      globalThis.crypto = originalCrypto;

      // Should set run ID
      const runIdCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RUN_ID",
      );
      expect(runIdCalls.length).toBe(1);

      // Should set project path
      const pathCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_PROJECT_PATH",
      );
      expect(pathCalls.length).toBe(1);
      expect((pathCalls[0][0] as { path: string }).path).toBe("/home/user/project");

      // Should add user message "Selected: ..."
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const userMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "user",
      );
      expect(userMsg).toBeDefined();
      expect((userMsg![0] as { message: { content: string } }).message.content).toContain("/home/user/project");
    });

    it("handles scan failure gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal error" }),
      });

      const originalCrypto = globalThis.crypto;
      globalThis.crypto = { ...originalCrypto, randomUUID: () => "test-run-id-2" } as Crypto;

      await controller.handleFolderSelected("/bad/path");

      globalThis.crypto = originalCrypto;

      // Should still set project name (fallback)
      const nameCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_PROJECT_NAME",
      );
      expect(nameCalls.length).toBe(1);
      // Fallback name is last segment of path
      expect((nameCalls[0][0] as { name: string }).name).toBe("path");
    });
  });

  // -----------------------------------------------------------------------
  // approvePhase — transitions
  // -----------------------------------------------------------------------

  describe("approvePhase", () => {
    it("dispatches user message and completes the phase", async () => {
      const es = mockEventSource();

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/api/analyze")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ sessionId: "sess-1" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      });

      // Start the approve and immediately trigger session completion
      const promise = controller.approvePhase(1 as 1);

      // Wait a tick for the fetch to complete and EventSource to be created
      await new Promise((r) => setTimeout(r, 0));
      es.triggerMessage({ type: "done", data: { routeCount: 5, flowCount: 3 } });
      await new Promise((r) => setTimeout(r, 0));
      es.triggerMessage({ type: "done", data: { routeCount: 5, flowCount: 3 } });

      await promise;

      // Should dispatch user "Approved" message
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const userApproval = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string; content: string } }).message.role === "user",
      );
      expect(userApproval).toBeDefined();

      // Should dispatch COMPLETE_PHASE
      const completeCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "COMPLETE_PHASE",
      );
      expect(completeCalls.length).toBe(1);
      expect((completeCalls[0][0] as { phase: number }).phase).toBe(1);
    });

    it("handles errors by restarting from current phase", async () => {
      // Make the API call fail
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await controller.approvePhase(1 as 1);

      // Should dispatch RESTART_FROM_PHASE on error
      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(1);
      expect((restartCalls[0][0] as { phase: number }).phase).toBe(1);

      // Should show error message with retry action
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const errorMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("error"),
      );
      expect(errorMsg).toBeDefined();
    });

    it("does not run if already busy", async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      );

      controller.approvePhase(1 as 1);
      // Second call should be no-op since first is still running
      await controller.approvePhase(1 as 1);

      const completeCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "COMPLETE_PHASE",
      );
      // Only one COMPLETE_PHASE from the first call
      expect(completeCalls.length).toBe(1);
    });

    it("handles phase 6 to 7 transition (audio + merge)", async () => {
      const es = mockEventSource();
      mockState.currentPhase = 6;

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: `sess-${url}` }),
        });
      });

      const promise = controller.approvePhase(6 as 6);

      // Trigger done events for audio and merge sessions
      await new Promise((r) => setTimeout(r, 0));
      es.triggerMessage({ type: "done", data: {} });
      await new Promise((r) => setTimeout(r, 0));
      es.triggerMessage({ type: "done", data: {} });

      await promise;

      // Should set right panel to phase 7
      const panelCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RIGHT_PANEL",
      );
      const phase7Panel = panelCalls.find((c: unknown[]) => (c[0] as { phase: number }).phase === 7);
      expect(phase7Panel).toBeDefined();
    });

    it("handles phase 4 to 5 transition (recording)", async () => {
      const es = mockEventSource();
      mockState.currentPhase = 4;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: "sess-record" }),
        });
      });

      const promise = controller.approvePhase(4 as 4);

      await new Promise((r) => setTimeout(r, 0));
      es.triggerMessage({ type: "done", data: {} });

      await promise;

      // Should set right panel to phase 5
      const panelCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RIGHT_PANEL",
      );
      const phase5Panel = panelCalls.find((c: unknown[]) => (c[0] as { phase: number }).phase === 5);
      expect(phase5Panel).toBeDefined();
    });

    it("handles phase 5 to 6 transition (voiceover)", async () => {
      mockState.currentPhase = 5;

      await controller.approvePhase(5 as 5);

      // Phase 6 is voiceover — no session needed, just panel setup
      const panelCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RIGHT_PANEL",
      );
      const phase6Panel = panelCalls.find((c: unknown[]) => (c[0] as { phase: number }).phase === 6);
      expect(phase6Panel).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // handleRecordingComplete
  // -----------------------------------------------------------------------

  describe("handleRecordingComplete", () => {
    it("dispatches recording complete messages", async () => {
      await controller.handleRecordingComplete();

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      expect(addMsgCalls.length).toBe(2);

      const firstContent = (addMsgCalls[0][0] as { message: { content: string } }).message.content;
      expect(firstContent).toContain("recorded");

      const secondContent = (addMsgCalls[1][0] as { message: { content: string } }).message.content;
      expect(secondContent).toContain("voiceover");
    });
  });

  // -----------------------------------------------------------------------
  // handleUserMessage
  // -----------------------------------------------------------------------

  describe("handleUserMessage", () => {
    it("sends message to chat API and dispatches response", async () => {
      mockState.runId = "run-test";

      globalThis.fetch = mockFetchResponse({
        response: "Sure, I can help with that.",
        suggestedAction: null,
      });

      await controller.handleUserMessage("Hello there");

      // Should dispatch user message
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const userMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "user",
      );
      expect(userMsg).toBeDefined();

      // Should dispatch SET_TYPING true then false
      const typingCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_TYPING",
      );
      expect(typingCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("falls back to keyword context on API error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await controller.handleUserMessage("help me please");

      // Should still dispatch AI message (fallback)
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "ai",
      );
      expect(aiMsg).toBeDefined();
    });

    it("falls back on network error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network down"));

      await controller.handleUserMessage("how does this work?");

      // Should still show a response via keyword matching
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      expect(addMsgCalls.length).toBeGreaterThanOrEqual(2); // user + AI fallback
    });

    it("includes approve action card when API suggests it", async () => {
      globalThis.fetch = mockFetchResponse({
        response: "Looks good!",
        suggestedAction: "approve",
      });

      await controller.handleUserMessage("looks ready");

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "ai",
      );
      expect(aiMsg).toBeDefined();
      const card = (aiMsg![0] as { message: { actionCard?: { type: string } } }).message.actionCard;
      expect(card?.type).toBe("approve");
    });

    it("includes edit action card when API suggests edit", async () => {
      globalThis.fetch = mockFetchResponse({
        response: "What would you like to change?",
        suggestedAction: "edit",
      });

      await controller.handleUserMessage("I want to change something");

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "ai",
      );
      expect(aiMsg).toBeDefined();
      const card = (aiMsg![0] as { message: { actionCard?: { type: string; label?: string } } }).message.actionCard;
      expect(card?.type).toBe("approve");
      expect(card?.label).toBe("Edit...");
    });
  });

  // -----------------------------------------------------------------------
  // handleEditRequest
  // -----------------------------------------------------------------------

  describe("handleEditRequest", () => {
    it("dispatches edit mode and prompt message", async () => {
      await controller.handleEditRequest(2 as 2);

      const editCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_EDIT_MODE",
      );
      expect(editCalls.length).toBe(1);
      expect((editCalls[0][0] as { phase: number }).phase).toBe(2);

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { content: string } }).message.content.includes("change"),
      );
      expect(aiMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // handleEditSubmit
  // -----------------------------------------------------------------------

  describe("handleEditSubmit", () => {
    it("posts edit request and dispatches success messages", async () => {
      const es = mockEventSource();

      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: "sess-edit" }),
        });
      });

      const promise = controller.handleEditSubmit(2 as 2, "Add more routes");

      await new Promise((r) => setTimeout(r, 0));
      es.triggerMessage({ type: "done", data: {} });

      await promise;

      // Should clear edit mode
      const editCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_EDIT_MODE",
      );
      expect(editCalls.length).toBe(1);
      expect((editCalls[0][0] as { phase: null }).phase).toBeNull();

      // Should dispatch REFRESH_PANEL
      const refreshCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "REFRESH_PANEL",
      );
      expect(refreshCalls.length).toBe(1);
    });

    it("handles edit failure gracefully", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Edit failed"));

      await controller.handleEditSubmit(3 as 3, "Change data entities");

      // Should show error message with approve card
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const errorMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("issue"),
      );
      expect(errorMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // getAffectedPhases / handleGoBackToPhase
  // -----------------------------------------------------------------------

  describe("handleGoBackToPhase", () => {
    it("restarts from target phase when no completed phases after it", async () => {
      mockState.phaseStatuses = {
        1: "completed",
        2: "active",
        3: "locked",
        4: "locked",
        5: "locked",
        6: "locked",
        7: "locked",
      };

      await controller.handleGoBackToPhase(1 as 1);

      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(1);
      expect((restartCalls[0][0] as { phase: number }).phase).toBe(1);
    });

    it("warns about affected phases when going back over completed phases", async () => {
      mockState.phaseStatuses = {
        1: "completed",
        2: "completed",
        3: "completed",
        4: "active",
        5: "locked",
        6: "locked",
        7: "locked",
      };

      await controller.handleGoBackToPhase(1 as 1);

      // Should NOT dispatch RESTART_FROM_PHASE (should warn instead)
      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(0);

      // Should show warning message
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const warnMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("reset"),
      );
      expect(warnMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // handleEditPhaseFromPanel
  // -----------------------------------------------------------------------

  describe("handleEditPhaseFromPanel", () => {
    it("restarts from phase when no completed phases after it", async () => {
      mockState.phaseStatuses = {
        1: "completed",
        2: "active",
        3: "locked",
        4: "locked",
        5: "locked",
        6: "locked",
        7: "locked",
      };

      await controller.handleEditPhaseFromPanel(1 as 1);

      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(1);
    });

    it("warns about affected phases when completed phases exist after target", async () => {
      mockState.phaseStatuses = {
        1: "completed",
        2: "completed",
        3: "completed",
        4: "completed",
        5: "active",
        6: "locked",
        7: "locked",
      };

      await controller.handleEditPhaseFromPanel(2 as 2);

      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(0);

      // Should show warning with affected phase names
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_MESSAGE",
      );
      const warnMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("reset"),
      );
      expect(warnMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // notifySidebarEdit
  // -----------------------------------------------------------------------

  describe("notifySidebarEdit", () => {
    it("dispatches SIDEBAR_EDIT action", () => {
      controller.notifySidebarEdit(2 as 2, "updated route /about");

      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SIDEBAR_EDIT",
        phase: 2,
        description: "updated route /about",
      });
    });
  });
});
