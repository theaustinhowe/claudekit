"use client";

import { ErrorPage } from "@devkit/ui/components/error-page";

export default function SkillsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage {...props} />;
}
