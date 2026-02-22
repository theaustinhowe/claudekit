"use client";

import { ErrorPage } from "@claudekit/ui/components/error-page";

export default function SettingsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage {...props} />;
}
