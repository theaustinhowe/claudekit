"use client";

import { useCallback, useEffect, useState } from "react";

interface FileEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  size: number;
}

interface FileBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function FileBrowser({ open, onClose, onSelect }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const fetchDirectory = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = path ? `/api/fs/browse?path=${encodeURIComponent(path)}` : "/api/fs/browse";
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to read directory");
      }
      const data = await res.json();
      setCurrentPath(data.path);
      // Only show directories since we are selecting a project folder
      const dirs = (data.entries as FileEntry[]).filter((e) => e.type === "directory");
      setEntries(dirs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load home directory when modal opens
  useEffect(() => {
    if (open) {
      fetchDirectory();
    }
  }, [open, fetchDirectory]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.name.startsWith("."));
  const pathSegments = currentPath.split("/").filter(Boolean);
  const isRoot = currentPath === "/";

  const navigateTo = (path: string) => {
    fetchDirectory(path);
  };

  const goUp = () => {
    const parent = currentPath.replace(/\/[^/]+\/?$/, "") || "/";
    fetchDirectory(parent);
  };

  const navigateToBreadcrumb = (index: number) => {
    const path = `/${pathSegments.slice(0, index + 1).join("/")}`;

    fetchDirectory(path);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: modal backdrop dismisses on click, not a true button
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "fadeIn 0.15s ease-out forwards",
      }}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClose();
      }}
    >
      {/* Modal card */}
      <div
        style={{
          width: "100%",
          maxWidth: 540,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--foreground) / 0.15)",
          borderRadius: "var(--radius)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
          animation: "fadeIn 0.2s ease-out forwards",
        }}
      >
        {/* Header */}
        <div
          className="border-b border-border"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            flexShrink: 0,
          }}
        >
          <span className="text-foreground" style={{ fontSize: 14, fontWeight: 600 }}>
            Select Project Folder
          </span>
          <label
            className="text-muted-foreground/70"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              cursor: "pointer",
              userSelect: "none",
              marginLeft: "auto",
              marginRight: 8,
            }}
          >
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
              style={{
                accentColor: "hsl(var(--primary))",
                cursor: "pointer",
              }}
            />
            Show hidden
          </label>
          <button
            type="button"
            onClick={onClose}
            className="border border-border rounded-sm text-muted-foreground/70 transition-all"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--foreground) / 0.2)";
              e.currentTarget.style.color = "hsl(var(--foreground))";
              e.currentTarget.style.background = "hsl(var(--muted))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.color = "";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* Breadcrumb bar */}
        <div
          className="scrollbar-none border-b border-border"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "8px 24px",
            fontSize: 12,
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => navigateTo("/")}
            className="rounded-sm font-sans"
            style={{
              background: "none",
              border: "none",
              color: pathSegments.length > 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              cursor: "pointer",
              padding: "2px 4px",
              fontSize: 12,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "hsl(var(--accent))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            /
          </button>
          {pathSegments.map((segment, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: path segments have no stable unique id
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
              <span className="text-muted-foreground">/</span>
              <button
                type="button"
                onClick={() => navigateToBreadcrumb(i)}
                className="rounded-sm font-sans"
                style={{
                  background: "none",
                  border: "none",
                  color: i < pathSegments.length - 1 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  cursor: "pointer",
                  padding: "2px 4px",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "hsl(var(--accent))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>

        {/* Directory list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 12px",
            minHeight: 0,
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 0",
                gap: 12,
              }}
            >
              <div
                className="bg-primary"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  opacity: 0.6,
                  animation: "pulse 1.2s ease-in-out infinite",
                }}
              />
              <span className="text-muted-foreground/70" style={{ fontSize: 13 }}>
                Loading...
              </span>
            </div>
          ) : error ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "32px 16px",
                textAlign: "center",
              }}
            >
              <span className="text-destructive" style={{ fontSize: 13 }}>
                {error}
              </span>
              <button
                type="button"
                onClick={() => fetchDirectory(currentPath || undefined)}
                className="bg-muted rounded-md text-muted-foreground font-sans transition-all"
                style={{
                  border: "1px solid hsl(var(--foreground) / 0.2)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "8px 16px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "hsl(var(--primary))";
                  e.currentTarget.style.color = "hsl(var(--primary))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "hsl(var(--foreground) / 0.2)";
                  e.currentTarget.style.color = "";
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Go Up row */}
              {!isRoot && (
                <button
                  type="button"
                  onClick={goUp}
                  className="rounded-sm font-sans text-muted-foreground/70 transition-all"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "8px 12px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "hsl(var(--muted))";
                    e.currentTarget.style.color = "hsl(var(--muted-foreground))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "";
                  }}
                >
                  <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>..</span>
                  <span style={{ fontStyle: "italic" }}>Go up</span>
                </button>
              )}

              {/* Directory entries */}
              {visibleEntries.map((entry) => (
                <button
                  type="button"
                  key={entry.path}
                  onClick={() => navigateTo(entry.path)}
                  className="rounded-sm font-sans text-foreground transition-all"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "8px 12px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "hsl(var(--accent))";
                    e.currentTarget.style.color = "hsl(var(--primary))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "";
                  }}
                >
                  <span
                    className="text-primary"
                    style={{
                      fontSize: 15,
                      width: 20,
                      textAlign: "center",
                      flexShrink: 0,
                    }}
                  >
                    {"\uD83D\uDCC1"}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.name}
                  </span>
                </button>
              ))}

              {/* Empty state */}
              {visibleEntries.length === 0 && !loading && (
                <div
                  className="text-muted-foreground"
                  style={{
                    padding: "32px 0",
                    textAlign: "center",
                    fontSize: 13,
                  }}
                >
                  No folders found in this directory
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="border-t border-border"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px",
            flexShrink: 0,
          }}
        >
          <span
            className="text-muted-foreground"
            style={{
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "50%",
            }}
            title={currentPath}
          >
            {currentPath}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="font-sans rounded-md text-muted-foreground/70 transition-all"
              style={{
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 500,
                background: "transparent",
                border: "1px solid hsl(var(--border))",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--foreground) / 0.2)";
                e.currentTarget.style.color = "hsl(var(--muted-foreground))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--border))";
                e.currentTarget.style.color = "";
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSelect(currentPath)}
              className="font-sans rounded-md bg-primary text-primary-foreground transition-all"
              style={{
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              Select This Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
