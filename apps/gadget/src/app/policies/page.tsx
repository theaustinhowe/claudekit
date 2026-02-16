import type { Metadata } from "next";
import { PoliciesClient } from "@/components/policies/policies-client";
import { getCustomRules } from "@/lib/actions/custom-rules";
import { getPolicies } from "@/lib/actions/policies";
import { getPolicyTemplates } from "@/lib/actions/policy-templates";

export const metadata: Metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const [policies, templates, rules] = await Promise.all([getPolicies(), getPolicyTemplates(), getCustomRules()]);

  return <PoliciesClient policies={policies} templates={templates} rules={rules} />;
}
