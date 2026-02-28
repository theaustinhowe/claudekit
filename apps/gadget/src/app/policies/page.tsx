import type { Metadata } from "next";
import { PoliciesClient } from "@/components/policies/policies-client";
import { getCustomRules } from "@/lib/actions/custom-rules";
import { getPolicies } from "@/lib/actions/policies";

export const metadata: Metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const [policies, rules] = await Promise.all([getPolicies(), getCustomRules()]);

  return <PoliciesClient policies={policies} rules={rules} />;
}
