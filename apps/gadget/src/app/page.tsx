import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getReposNeedingAttention } from "@/lib/actions/repos";
import { listSessions } from "@/lib/actions/sessions";
import { getDashboardOnboardingState, getDashboardStats } from "@/lib/actions/settings";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: `Dashboard | ${APP_NAME}` };

export default async function DashboardPage() {
  const [stats, onboardingState, attentionRepos, recentSessions] = await Promise.all([
    getDashboardStats(),
    getDashboardOnboardingState(),
    getReposNeedingAttention(),
    listSessions({ limit: 10 }),
  ]);

  return (
    <DashboardClient
      stats={stats}
      onboardingState={onboardingState}
      attentionRepos={attentionRepos}
      recentSessions={recentSessions}
    />
  );
}
