import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Phase, PhaseStatus } from "./types";

// ---------------------------------------------------------------------------
// Mock external modules BEFORE importing the module under test
// ---------------------------------------------------------------------------

// Mock store
const mockDispatch = vi.fn();
const mockState: {
  currentPhase: Phase;
  phaseStatuses: Record<Phase, PhaseStatus>;
  threads: Record<Phase, unknown[]>;
  activeThreadIds: Record<Phase, string | null>;
  viewingPhase: Phase;
  isTyping: boolean;
  projectName: string;
  rightPanelContent: Phase | null;
  editMode: string | null;
  projectPath: string | null;
  activeSessionId: string | null;
  fileBrowserOpen: boolean;
  historySidebarOpen: boolean;
  runId: string | null;
  panelRefreshKey: number;
} = {
  currentPhase: 1,
  phaseStatuses: {
    1: "active",
    2: "locked",
    3: "locked",
    4: "locked",
    5: "locked",
    6: "locked",
    7: "locked",
  },
  threads: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
  activeThreadIds: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null },
  viewingPhase: 1,
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
    useCallback: (fn: (...args: never[]) => unknown) => fn,
    useRef: (initial: unknown) => ({ current: initial }),
  };
});

// ---------------------------------------------------------------------------
// EventSource mock — set up on globalThis BEFORE any imports
// ---------------------------------------------------------------------------

interface MockESInstance {
  close: ReturnType<typeof vi.fn>;
  onmessage: ((evt: { data: string }) => void) | null;
  onerror: (() => void) | null;
  triggerMessage: (data: unknown) => void;
  triggerError: () => void;
}

const esInstances: MockESInstance[] = [];

function createESInstance(): MockESInstance {
  const instance: MockESInstance = {
    close: vi.fn(),
    onmessage: null,
    onerror: null,
    triggerMessage(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) });
    },
    triggerError() {
      this.onerror?.();
    },
  };
  esInstances.push(instance);
  return instance;
}

// Set EventSource globally before module evaluation
(globalThis as unknown as { EventSource: unknown }).EventSource = function MockEventSource() {
  return createESInstance();
};

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePhaseController", () => {
  let controller: ReturnType<typeof import("./phase-controller").usePhaseController>;

  beforeEach(async () => {
    vi.clearAllMocks();
    esInstances.length = 0;

    mockState.currentPhase = 1;
    mockState.runId = null;
    mockState.projectPath = null;
    mockState.viewingPhase = 1;
    mockState.phaseStatuses = {
      1: "active",
      2: "locked",
      3: "locked",
      4: "locked",
      5: "locked",
      6: "locked",
      7: "locked",
    };
    mockState.threads = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    mockState.activeThreadIds = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };

    globalThis.fetch = mockFetchResponse({});

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

      const typingCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_TYPING",
      );
      expect(typingCalls.length).toBeGreaterThanOrEqual(2);

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      expect(addMsgCalls.length).toBe(2);

      const firstMsg = (addMsgCalls[0][0] as { message: { content: string } }).message;
      expect(firstMsg.content).toContain("Welcome to B4U");

      const secondMsg = (addMsgCalls[1][0] as { message: { content: string; actionCard?: { type: string } } }).message;
      expect(secondMsg.content).toContain("project folder");
      expect(secondMsg.actionCard?.type).toBe("folder-select");

      const panelCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RIGHT_PANEL",
      );
      expect(panelCalls.length).toBe(1);
      expect((panelCalls[0][0] as { phase: number }).phase).toBe(1);
    });

    it("does not run if already busy", async () => {
      const p1 = controller.startPhase1();
      const p2 = controller.startPhase1();
      await Promise.all([p1, p2]);

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      expect(addMsgCalls.length).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // handleFolderSelected
  // -----------------------------------------------------------------------

  describe("handleFolderSelected", () => {
    it("sets project path and dispatches messages (runId already set by startPhase1)", async () => {
      // Simulate startPhase1 having already created a runId and thread
      mockState.runId = "test-run-id";
      mockState.threads[1] = [
        {
          id: "t-1",
          runId: "test-run-id",
          phase: 1,
          revision: 1,
          messages: [],
          decisions: [
            {
              id: "d-1",
              key: "folder-path",
              label: "Folder",
              type: "text",
              options: undefined,
              value: null,
              decidedAt: null,
            },
          ],
          status: "active",
          createdAt: Date.now(),
        },
      ];
      mockState.activeThreadIds[1] = "t-1";

      globalThis.fetch = mockFetchResponse({
        name: "my-app",
        framework: "Next.js",
        directories: ["src", "public"],
        auth: "NextAuth",
        database: "PostgreSQL",
        tree: [{ name: "src", type: "directory" }],
      });

      await controller.handleFolderSelected("/home/user/project");

      // startPhase1 creates runId, so handleFolderSelected should NOT dispatch SET_RUN_ID
      const runIdCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RUN_ID",
      );
      expect(runIdCalls.length).toBe(0);

      const pathCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_PROJECT_PATH",
      );
      expect(pathCalls.length).toBe(1);
      expect((pathCalls[0][0] as { path: string }).path).toBe("/home/user/project");

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const userMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "user",
      );
      expect(userMsg).toBeDefined();
      expect((userMsg?.[0] as { message: { content: string } }).message.content).toContain("/home/user/project");
    });

    it("handles scan failure gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal error" }),
      });

      vi.stubGlobal("crypto", { randomUUID: () => "test-run-id-2" });

      await controller.handleFolderSelected("/bad/path");

      const nameCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_PROJECT_NAME",
      );
      expect(nameCalls.length).toBe(1);
      expect((nameCalls[0][0] as { name: string }).name).toBe("path");
    });

    it("dispatches RESTART_FROM_PHASE when folder was already selected", async () => {
      // Simulate a thread where folder-path decision was already set (re-selection)
      mockState.runId = "existing-run";
      mockState.threads[1] = [
        {
          id: "t-1",
          runId: "existing-run",
          phase: 1,
          revision: 1,
          messages: [],
          decisions: [
            {
              id: "d-1",
              key: "folder-path",
              label: "Folder",
              type: "text",
              options: undefined,
              value: "/old/path",
              decidedAt: Date.now(),
            },
          ],
          status: "active",
          createdAt: Date.now(),
        },
      ];
      mockState.activeThreadIds[1] = "t-1";

      globalThis.fetch = mockFetchResponse({
        name: "my-app",
        framework: "Next.js",
        directories: [],
        auth: "None",
        database: "None",
      });

      await controller.handleFolderSelected("/new/path");

      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(1);
      expect((restartCalls[0][0] as { phase: number }).phase).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // approvePhase — transitions
  // -----------------------------------------------------------------------

  describe("approvePhase", () => {
    it("dispatches user message and completes the phase", async () => {
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

      const promise = controller.approvePhase(1);

      // Poll until first EventSource is created
      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(1));
      esInstances[0].triggerMessage({ type: "done", data: {} });

      // Poll until second EventSource is created
      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(2));
      esInstances[1].triggerMessage({ type: "done", data: { routeCount: 5, flowCount: 3 } });

      await promise;

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const userApproval = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "user",
      );
      expect(userApproval).toBeDefined();

      const completeCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "COMPLETE_PHASE",
      );
      expect(completeCalls.length).toBe(1);
      expect((completeCalls[0][0] as { phase: number }).phase).toBe(1);
    });

    it("records approve decision via SET_THREAD_DECISION", async () => {
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

      const promise = controller.approvePhase(1);

      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(1));
      esInstances[0].triggerMessage({ type: "done", data: {} });
      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(2));
      esInstances[1].triggerMessage({ type: "done", data: {} });

      await promise;

      const decisionCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_THREAD_DECISION",
      );
      expect(decisionCalls.length).toBe(1);
      expect((decisionCalls[0][0] as { key: string }).key).toBe("confirm-scan");
    });

    it("handles errors without rolling back the approved phase", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await controller.approvePhase(1);

      // Should NOT dispatch RESTART_FROM_PHASE — the approved phase stays completed
      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(0);

      // Should show error message with retry option
      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
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

      controller.approvePhase(1);
      await controller.approvePhase(1);

      const completeCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "COMPLETE_PHASE",
      );
      expect(completeCalls.length).toBe(1);
    });

    it("handles phase 6 to 7 transition (audio + merge)", async () => {
      mockState.currentPhase = 6;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: "sess-audio" }),
        });
      });

      const promise = controller.approvePhase(6);

      // Wait for audio generate session EventSource
      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(1));
      esInstances[0].triggerMessage({ type: "done", data: {} });

      // Wait for merge session EventSource
      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(2));
      esInstances[1].triggerMessage({ type: "done", data: {} });

      await promise;

      const panelCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RIGHT_PANEL",
      );
      const phase7Panel = panelCalls.find((c: unknown[]) => (c[0] as { phase: number }).phase === 7);
      expect(phase7Panel).toBeDefined();
    });

    it("handles phase 4 to 5 transition (recording)", async () => {
      mockState.currentPhase = 4;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: "sess-record" }),
        });
      });

      const promise = controller.approvePhase(4);

      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(1));
      esInstances[0].triggerMessage({ type: "done", data: {} });

      await promise;

      const panelCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_RIGHT_PANEL",
      );
      const phase5Panel = panelCalls.find((c: unknown[]) => (c[0] as { phase: number }).phase === 5);
      expect(phase5Panel).toBeDefined();
    });

    it("handles phase 5 to 6 transition (voiceover)", async () => {
      mockState.currentPhase = 5;

      await controller.approvePhase(5);

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
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
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

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const userMsg = addMsgCalls.find(
        (c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "user",
      );
      expect(userMsg).toBeDefined();

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

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find((c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "ai");
      expect(aiMsg).toBeDefined();
    });

    it("falls back on network error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network down"));

      await controller.handleUserMessage("how does this work?");

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      expect(addMsgCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("includes approve action card when API suggests it", async () => {
      globalThis.fetch = mockFetchResponse({
        response: "Looks good!",
        suggestedAction: "approve",
      });

      await controller.handleUserMessage("looks ready");

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find((c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "ai");
      expect(aiMsg).toBeDefined();
      const card = (aiMsg?.[0] as { message: { actionCard?: { type: string } } }).message.actionCard;
      expect(card?.type).toBe("approve");
    });

    it("includes edit action card when API suggests edit", async () => {
      globalThis.fetch = mockFetchResponse({
        response: "What would you like to change?",
        suggestedAction: "edit",
      });

      await controller.handleUserMessage("I want to change something");

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find((c: unknown[]) => (c[0] as { message: { role: string } }).message.role === "ai");
      expect(aiMsg).toBeDefined();
      const card = (aiMsg?.[0] as { message: { actionCard?: { type: string; label?: string } } }).message.actionCard;
      expect(card?.type).toBe("approve");
      expect(card?.label).toBe("Edit...");
    });
  });

  // -----------------------------------------------------------------------
  // handleEditRequest
  // -----------------------------------------------------------------------

  describe("handleEditRequest", () => {
    it("dispatches edit mode and prompt message", async () => {
      await controller.handleEditRequest(2);

      const editCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "SET_EDIT_MODE",
      );
      expect(editCalls.length).toBe(1);
      expect((editCalls[0][0] as { phase: number }).phase).toBe(2);

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const aiMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("change"),
      );
      expect(aiMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // handleEditSubmit
  // -----------------------------------------------------------------------

  describe("handleEditSubmit", () => {
    it("posts edit request and dispatches success messages", async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: "sess-edit" }),
        });
      });

      const promise = controller.handleEditSubmit(2 as 2, "Add more routes");

      // Poll until the EventSource instance is created, then resolve it
      await vi.waitFor(() => expect(esInstances.length).toBeGreaterThanOrEqual(1));
      esInstances[0].triggerMessage({ type: "done", data: {} });

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

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const errorMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("issue"),
      );
      expect(errorMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // handleGoBackToPhase
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

      await controller.handleGoBackToPhase(1);

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

      await controller.handleGoBackToPhase(1);

      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(0);

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const warnMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("lock"),
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

      await controller.handleEditPhaseFromPanel(1);

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

      await controller.handleEditPhaseFromPanel(2);

      const restartCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "RESTART_FROM_PHASE",
      );
      expect(restartCalls.length).toBe(0);

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      const warnMsg = addMsgCalls.find((c: unknown[]) =>
        (c[0] as { message: { content: string } }).message.content.includes("lock"),
      );
      expect(warnMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // notifySidebarEdit
  // -----------------------------------------------------------------------

  describe("notifySidebarEdit", () => {
    it("dispatches ADD_THREAD_MESSAGE with system role", () => {
      controller.notifySidebarEdit(2 as 2, "updated route /about");

      const addMsgCalls = mockDispatch.mock.calls.filter(
        (c: unknown[]) => (c[0] as { type: string }).type === "ADD_THREAD_MESSAGE",
      );
      expect(addMsgCalls.length).toBe(1);
      const msg = (addMsgCalls[0][0] as { message: { role: string; content: string } }).message;
      expect(msg.role).toBe("system");
      expect(msg.content).toContain("updated route /about");
    });
  });
});
