import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectDevice } from "./connect-device";

// Mock qrcode.react
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code" data-value={value} />,
}));

// Mock the API module
const mockFetchNetworkInfo = vi.fn();
vi.mock("@/lib/api", () => ({
  fetchNetworkInfo: (...args: unknown[]) => mockFetchNetworkInfo(...args),
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

describe("ConnectDevice", () => {
  beforeEach(() => {
    mockFetchNetworkInfo.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading skeleton initially", () => {
    // Make the fetch hang so we stay in loading state
    mockFetchNetworkInfo.mockReturnValue(new Promise(() => {}));
    render(<ConnectDevice />);

    // During loading, the card title should not yet be rendered (it's a skeleton)
    expect(screen.queryByText("Connect Device")).not.toBeInTheDocument();
  });

  it("renders error state with retry button", async () => {
    mockFetchNetworkInfo.mockResolvedValueOnce({ error: "Network failure" });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("Network failure")).toBeInTheDocument();
    });

    expect(screen.getByText("Connect Device")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders empty state when no IPs are found", async () => {
    mockFetchNetworkInfo.mockResolvedValueOnce({
      data: { ips: [], port: 2201, wsPort: 2201 },
    });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText(/No local network addresses found/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });

  it("renders QR code with the correct URL when IPs are found", async () => {
    mockFetchNetworkInfo.mockResolvedValue({
      data: { ips: ["192.168.1.100"], port: 2201, wsPort: 2201 },
    });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByTestId("qr-code")).toBeInTheDocument();
    });

    const qrCode = screen.getByTestId("qr-code");
    expect(qrCode).toHaveAttribute("data-value", "http://192.168.1.100:2200");
  });

  it("displays the URL text with the selected IP", async () => {
    mockFetchNetworkInfo.mockResolvedValue({
      data: { ips: ["192.168.1.100"], port: 2201, wsPort: 2201 },
    });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("http://192.168.1.100:2200")).toBeInTheDocument();
    });
  });

  it("renders the card title and description", async () => {
    mockFetchNetworkInfo.mockResolvedValue({
      data: { ips: ["192.168.1.100"], port: 2201, wsPort: 2201 },
    });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("Connect Device")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Scan the QR code with your phone to access GoGo on the same WiFi network"),
    ).toBeInTheDocument();
  });

  it("shows IP selection badges when multiple IPs are available", async () => {
    mockFetchNetworkInfo.mockResolvedValue({
      data: { ips: ["192.168.1.100", "10.0.0.5"], port: 2201, wsPort: 2201 },
    });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
    });

    expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
    expect(
      screen.getByText("Multiple network addresses found. Select the one on your WiFi network:"),
    ).toBeInTheDocument();
  });

  it("does not show IP selection when only one IP is available", async () => {
    mockFetchNetworkInfo.mockResolvedValue({
      data: { ips: ["192.168.1.100"], port: 2201, wsPort: 2201 },
    });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("Connect Device")).toBeInTheDocument();
    });

    expect(
      screen.queryByText("Multiple network addresses found. Select the one on your WiFi network:"),
    ).not.toBeInTheDocument();
  });

  it("renders connection instructions", async () => {
    mockFetchNetworkInfo.mockResolvedValue({
      data: { ips: ["192.168.1.100"], port: 2201, wsPort: 2201 },
    });
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("To connect:")).toBeInTheDocument();
    });

    expect(screen.getByText("Ensure your phone is on the same WiFi network")).toBeInTheDocument();
    expect(screen.getByText("Open your phone's camera and scan the QR code")).toBeInTheDocument();
    expect(screen.getByText("Tap the link that appears to open GoGo")).toBeInTheDocument();
  });

  it("handles fetch exception gracefully", async () => {
    mockFetchNetworkInfo.mockRejectedValueOnce(new Error("Fetch failed"));
    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch network information")).toBeInTheDocument();
    });
  });

  it("retries fetching on Retry button click", async () => {
    mockFetchNetworkInfo.mockResolvedValueOnce({ error: "Network failure" }).mockResolvedValueOnce({
      data: { ips: ["192.168.1.100"], port: 2201, wsPort: 2201 },
    });

    render(<ConnectDevice />);

    await waitFor(() => {
      expect(screen.getByText("Network failure")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", { name: /retry/i });
    retryButton.click();

    await waitFor(() => {
      expect(screen.getByTestId("qr-code")).toBeInTheDocument();
    });
  });
});
