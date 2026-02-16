"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@devkit/ui/components/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@devkit/ui/components/dialog";
import { BarChart3, Bot, ChevronDown, DollarSign, Gauge, Layers, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClaudeRateLimits, ClaudeUsageStats, RateLimitWindow } from "../types";

function formatTokenCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatModelName(id: string): string {
  return id
    .replace(/^claude-/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPeakHour(hourCounts: Record<string, number>): string {
  const entries = Object.entries(hourCounts);
  if (entries.length === 0) return "N/A";
  const sorted = entries.sort(([, a], [, b]) => b - a);
  const hour = Number.parseInt(sorted[0][0], 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}${suffix}`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `~$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getUtilizationColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function getUtilizationTextColor(pct: number): string {
  if (pct >= 90) return "text-red-500";
  if (pct >= 70) return "text-amber-500";
  return "text-emerald-500";
}

/** Format as h:mm:ss countdown */
function formatCountdown(resetsAt: string): string {
  if (!resetsAt) return "";
  try {
    const diffMs = new Date(resetsAt).getTime() - Date.now();
    if (diffMs <= 0) return "0:00:00";
    const totalSec = Math.floor(diffMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function formatResetDate(resetsAt: string): string {
  if (!resetsAt) return "";
  try {
    return new Date(resetsAt).toLocaleDateString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Parse any date string safely */
function formatFirstSessionDate(dateStr: string | null): string {
  if (!dateStr) return "unknown";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "unknown";
    return d.toLocaleDateString();
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Live countdown hook — ticks every second for the header widget
// ---------------------------------------------------------------------------
function useCountdown(resetsAt: string | undefined): string {
  const [countdown, setCountdown] = useState(() => formatCountdown(resetsAt ?? ""));

  useEffect(() => {
    if (!resetsAt) return;
    setCountdown(formatCountdown(resetsAt));
    const id = setInterval(() => {
      setCountdown(formatCountdown(resetsAt));
    }, 1000);
    return () => clearInterval(id);
  }, [resetsAt]);

  return countdown;
}

// ---------------------------------------------------------------------------
// Rate limit bar (used in dialog)
// ---------------------------------------------------------------------------
function RateLimitBar({ label, window: w }: { label: string; window: RateLimitWindow }) {
  const pct = Math.min(Math.round(w.utilization), 100);
  const countdown = useCountdown(w.resetsAt);
  const resetDateStr = formatResetDate(w.resetsAt);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`tabular-nums font-semibold ${getUtilizationTextColor(pct)}`}>{pct}%</span>
          {countdown && (
            <span className="text-muted-foreground tabular-nums">
              resets {resetDateStr ? resetDateStr : `in ${countdown}`}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getUtilizationColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------
function Section({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-b border-border pb-4 last:border-b-0 last:pb-0">
      <CollapsibleTrigger className="flex items-center justify-between w-full group/section cursor-pointer py-0.5">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          {icon}
          {title}
        </h4>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/section:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function CacheEfficiency({ modelUsage }: { modelUsage: ClaudeUsageStats["modelUsage"] }) {
  const models = Object.entries(modelUsage).filter(([, t]) => {
    const total = t.inputTokens + t.cacheReadInputTokens + t.cacheCreationInputTokens;
    return total > 0;
  });

  if (models.length === 0) return null;

  return (
    <div className="space-y-2">
      {models.map(([model, tokens]) => {
        const total = tokens.inputTokens + tokens.cacheReadInputTokens + tokens.cacheCreationInputTokens;
        const hitRate = total > 0 ? (tokens.cacheReadInputTokens / total) * 100 : 0;
        return (
          <div key={model} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{formatModelName(model)}</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(hitRate, 100)}%` }} />
              </div>
              <span className="tabular-nums font-medium w-10 text-right">{hitRate.toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BurnRate({ recentDailyCosts }: { recentDailyCosts?: ClaudeUsageStats["recentDailyCosts"] }) {
  if (!recentDailyCosts || recentDailyCosts.length === 0) return null;

  const activeDays = recentDailyCosts.filter((d) => d.totalCostUSD > 0);
  if (activeDays.length === 0) return null;

  const avgDaily = activeDays.reduce((sum, d) => sum + d.totalCostUSD, 0) / activeDays.length;

  return (
    <div className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/30 border">
      <span className="text-muted-foreground flex items-center gap-1.5">
        <Zap className="w-3 h-3" />
        Avg daily burn ({activeDays.length} active days)
      </span>
      <span className="font-semibold tabular-nums text-amber-500">{formatCost(avgDaily)}/day</span>
    </div>
  );
}

/** Parse "YYYY-MM-DD" as local midnight (not UTC) to avoid off-by-one day in western timezones */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
export function ClaudeUsageDialog({
  open,
  onOpenChange,
  usage,
  rateLimits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: ClaudeUsageStats;
  rateLimits: ClaudeRateLimits | null;
}) {
  const recentDays = usage.dailyActivity.slice(-7);
  const maxMessages = Math.max(...recentDays.map((d) => d.messageCount), 1);

  const peakHour = getPeakHour(usage.hourCounts);
  const totalToolCalls = usage.dailyActivity.reduce((sum, d) => sum + d.toolCallCount, 0);

  const modelLimitEntries = rateLimits ? Object.entries(rateLimits.modelLimits) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Claude Code Usage</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plan Usage Limits — expanded by default */}
          {rateLimits && (
            <Section title="Plan Usage Limits" icon={<Gauge className="w-3.5 h-3.5" />} defaultOpen>
              <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                <RateLimitBar label="Current session" window={rateLimits.fiveHour} />

                <div className="pt-2 border-t">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Weekly limits</p>
                  <div className="space-y-3">
                    <RateLimitBar label="All models" window={rateLimits.sevenDay} />
                    {modelLimitEntries.map(([model, w]) => (
                      <RateLimitBar
                        key={model}
                        label={`${model.charAt(0).toUpperCase()}${model.slice(1)} only`}
                        window={w}
                      />
                    ))}
                  </div>
                </div>

                {rateLimits.extraUsage && (
                  <div className="pt-2 border-t space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Extra credits</span>
                      <span className="tabular-nums text-muted-foreground">
                        $
                        {rateLimits.extraUsage.usedCredits.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        / $
                        {rateLimits.extraUsage.monthlyLimit.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getUtilizationColor(Math.round(rateLimits.extraUsage.utilization))}`}
                        style={{ width: `${Math.min(Math.round(rateLimits.extraUsage.utilization), 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Overview stats */}
          <Section
            title={`Stats${usage.firstSessionDate ? ` since ${formatFirstSessionDate(usage.firstSessionDate)}` : ""}`}
            icon={<BarChart3 className="w-3.5 h-3.5" />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Sessions", value: usage.totalSessions.toLocaleString() },
                  { label: "Messages", value: usage.totalMessages.toLocaleString() },
                  { label: "Tool Calls", value: totalToolCalls.toLocaleString() },
                  { label: "Peak Hour", value: peakHour },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-bold">{item.value}</p>
                  </div>
                ))}
              </div>

              {recentDays.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Recent Activity (7 days)</p>
                  <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                    {recentDays.map((day) => {
                      const pct = Math.max((day.messageCount / maxMessages) * 100, 4);
                      const dateLabel = parseLocalDate(day.date).toLocaleDateString(undefined, {
                        weekday: "short",
                      });
                      return (
                        <div
                          key={day.date}
                          className="group/bar flex-1 flex flex-col items-center gap-1.5 h-full relative"
                        >
                          <div className="flex-1 w-full flex items-end">
                            <div
                              className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
                              style={{ height: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground leading-none">{dateLabel}</span>
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-opacity z-50">
                            <div className="bg-popover border rounded-md shadow-md px-3 py-2 text-xs whitespace-nowrap space-y-0.5">
                              <p className="font-medium pb-0.5">
                                {parseLocalDate(day.date).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                              <p className="text-muted-foreground tabular-nums">
                                {day.messageCount.toLocaleString()} messages
                              </p>
                              <p className="text-muted-foreground tabular-nums">
                                {day.sessionCount.toLocaleString()} sessions
                              </p>
                              <p className="text-muted-foreground tabular-nums">
                                {day.toolCallCount.toLocaleString()} tool calls
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Cost */}
          {usage.recentDailyCosts?.some((d) => d.totalCostUSD > 0) && (
            <Section title="Estimated Cost (7 days)" icon={<DollarSign className="w-3.5 h-3.5" />}>
              <div className="p-3 rounded-lg border bg-amber-500/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Total (API-equivalent)</span>
                  <span className="text-lg font-bold text-amber-500">
                    {formatCost(usage.recentDailyCosts.reduce((sum, d) => sum + d.totalCostUSD, 0))}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {usage.recentDailyCosts.map((day) => {
                    const isToday = day.date === new Date().toLocaleDateString("en-CA");
                    const dayName = parseLocalDate(day.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    });
                    const dateLabel = isToday ? `Today \u2014 ${dayName}` : dayName;
                    return (
                      <div key={day.date} className="flex items-center justify-between text-xs">
                        <span className={isToday ? "font-medium" : "text-muted-foreground"}>{dateLabel}</span>
                        <span
                          className={`tabular-nums ${day.totalCostUSD > 0 ? "font-medium" : "text-muted-foreground"}`}
                        >
                          {day.totalCostUSD > 0 ? formatCost(day.totalCostUSD) : "\u2014"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-2 border-t">
                  <BurnRate recentDailyCosts={usage.recentDailyCosts} />
                </div>
              </div>
            </Section>
          )}

          {/* Model Usage */}
          <Section title="Model Usage" icon={<Bot className="w-3.5 h-3.5" />}>
            <div className="space-y-3">
              {Object.entries(usage.modelUsage).map(([model, tokens]) => (
                <div key={model} className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{formatModelName(model)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {formatTokenCount(tokens.inputTokens + tokens.outputTokens)} tokens
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>In: {formatTokenCount(tokens.inputTokens)}</span>
                    <span>Out: {formatTokenCount(tokens.outputTokens)}</span>
                    <span>Cache read: {formatTokenCount(tokens.cacheReadInputTokens)}</span>
                    <span>Cache write: {formatTokenCount(tokens.cacheCreationInputTokens)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Cache Efficiency */}
          {Object.keys(usage.modelUsage).length > 0 && (
            <Section title="Cache Efficiency" icon={<Layers className="w-3.5 h-3.5" />}>
              <CacheEfficiency modelUsage={usage.modelUsage} />
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Header widget
// ---------------------------------------------------------------------------

/**
 * Header widget: shows current session utilization bar with h:mm:ss countdown.
 * Falls back to session/message counts when no OAuth data available.
 */
export function HeaderUsageWidget({
  usage,
  rateLimits,
  onClick,
}: {
  usage: ClaudeUsageStats;
  rateLimits: ClaudeRateLimits | null;
  onClick: () => void;
}) {
  const todayCostUSD = usage.todayCost?.totalCostUSD;
  const countdown = useCountdown(rateLimits?.fiveHour.resetsAt);

  if (rateLimits) {
    const pct = Math.min(Math.round(rateLimits.fiveHour.utilization), 100);

    return (
      <button
        type="button"
        className="hidden sm:flex items-center gap-2.5 h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={onClick}
      >
        <Bot className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getUtilizationColor(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={`tabular-nums font-semibold whitespace-nowrap ${getUtilizationTextColor(pct)} ${pct >= 80 ? "animate-pulse" : ""}`}
          >
            {pct}%
          </span>
        </div>
        {countdown && (
          <>
            <span className="text-border">|</span>
            <span className="tabular-nums whitespace-nowrap">{countdown}</span>
          </>
        )}
        {todayCostUSD != null && todayCostUSD > 0 && (
          <>
            <span className="text-border">|</span>
            <span className="tabular-nums whitespace-nowrap text-amber-500">{formatCost(todayCostUSD)}</span>
          </>
        )}
      </button>
    );
  }

  // Fallback: no OAuth data, show session/message counts
  const totalOutputTokens = Object.values(usage.modelUsage).reduce((sum, m) => sum + m.outputTokens, 0);

  return (
    <button
      type="button"
      className="hidden sm:flex items-center gap-3 h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <Bot className="w-3.5 h-3.5 text-violet-500 shrink-0" />
      <span className="tabular-nums whitespace-nowrap">{usage.totalSessions.toLocaleString()} sessions</span>
      <span className="text-border">|</span>
      <span className="tabular-nums whitespace-nowrap">{usage.totalMessages.toLocaleString()} msgs</span>
      <span className="text-border">|</span>
      <span className="tabular-nums whitespace-nowrap">{formatTokenCount(totalOutputTokens)} out</span>
      {todayCostUSD != null && todayCostUSD > 0 && (
        <>
          <span className="text-border">|</span>
          <span className="tabular-nums whitespace-nowrap text-amber-500">{formatCost(todayCostUSD)}</span>
        </>
      )}
    </button>
  );
}
