"use client";

import { ErrorPage } from "@devkit/ui/components/error-page";

export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage {...props} />;
}
