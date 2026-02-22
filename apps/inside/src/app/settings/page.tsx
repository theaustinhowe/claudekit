import type { Metadata } from "next";
import { PageBanner } from "@/components/layout/page-banner";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageBanner title="Settings" />
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-2xl mx-auto">
          <p className="text-sm text-muted-foreground">Settings page coming soon.</p>
        </div>
      </div>
    </div>
  );
}
