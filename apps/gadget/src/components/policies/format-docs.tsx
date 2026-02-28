import { Card, CardContent } from "@claudekit/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { ChevronRight, FileJson } from "lucide-react";

interface FieldDoc {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface FormatDocsProps {
  title?: string;
  example: string;
  fields: FieldDoc[];
  children?: React.ReactNode;
}

export function FormatDocs({ title = "Export Format Reference", example, fields, children }: FormatDocsProps) {
  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 group cursor-pointer">
        <ChevronRight className="w-4 h-4 transition-transform group-[[data-open]]:rotate-90" />
        <FileJson className="w-4 h-4" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardContent className="p-4 space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Example JSON</h4>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto font-mono leading-relaxed">{example}</pre>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Fields</h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left p-2 font-medium">Field</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-left p-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fields.map((f) => (
                      <tr key={f.name}>
                        <td className="p-2 font-mono text-xs">
                          {f.name}
                          {f.required && <span className="text-destructive ml-1">*</span>}
                        </td>
                        <td className="p-2 text-muted-foreground text-xs">{f.type}</td>
                        <td className="p-2 text-xs">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {children}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

const POLICY_EXAMPLE = `{
  "name": "My Project Policy",
  "description": "Standards for my projects",
  "expected_versions": {
    "typescript": "^5.0.0",
    "react": "^19.0.0"
  },
  "banned_dependencies": [
    {
      "name": "moment",
      "replacement": "date-fns",
      "reason": "Prefer lighter alternative"
    }
  ],
  "allowed_package_managers": ["pnpm", "npm"],
  "preferred_package_manager": "pnpm",
  "ignore_patterns": ["dist", "node_modules"],
  "repo_types": ["nextjs", "library"]
}`;

const POLICY_FIELDS: FieldDoc[] = [
  { name: "name", type: "string", required: true, description: "Policy display name" },
  { name: "description", type: "string", description: "What this policy enforces" },
  {
    name: "expected_versions",
    type: "object",
    description: 'Package version constraints, e.g. { "typescript": "^5.0.0" }',
  },
  {
    name: "banned_dependencies",
    type: "array",
    description: "List of { name, replacement?, reason } objects for banned packages",
  },
  { name: "allowed_package_managers", type: "string[]", description: 'e.g. ["pnpm", "npm"]' },
  { name: "preferred_package_manager", type: "string", description: 'Primary package manager, e.g. "pnpm"' },
  { name: "ignore_patterns", type: "string[]", description: "Glob patterns to skip during audits" },
  { name: "repo_types", type: "string[]", description: 'Applicable repo types, e.g. ["nextjs", "library"]' },
];

const RULE_EXAMPLE = `{
  "name": "Require LICENSE file",
  "description": "All repos must have a LICENSE file",
  "category": "structure",
  "severity": "warning",
  "rule_type": "file_exists",
  "config": {
    "paths": ["LICENSE", "LICENSE.md"]
  },
  "suggested_actions": [
    "Add a LICENSE file to the project root"
  ],
  "policy_id": null
}`;

const RULE_FIELDS: FieldDoc[] = [
  { name: "name", type: "string", required: true, description: "Rule display name" },
  {
    name: "rule_type",
    type: "string",
    required: true,
    description: "One of: file_exists, file_missing, file_contains, json_field",
  },
  { name: "description", type: "string", description: "What this rule checks" },
  {
    name: "category",
    type: "string",
    description: 'Finding category: dependencies, ai-files, structure, config, custom (default: "custom")',
  },
  {
    name: "severity",
    type: "string",
    description: 'One of: info, warning, error, critical (default: "warning")',
  },
  { name: "config", type: "object", description: "Rule-type-specific configuration (see below)" },
  { name: "suggested_actions", type: "string[]", description: "Recommended fix steps shown in findings" },
  { name: "policy_id", type: "string | null", description: "Bind to a specific policy, or null for all policies" },
];

const RULE_CONFIG_DOCS = [
  { type: "file_exists", config: '{ "paths": ["LICENSE", "LICENSE.md"] }', description: "Pass if any path exists" },
  { type: "file_missing", config: '{ "path": ".env" }', description: "Pass if path does not exist" },
  {
    type: "file_contains",
    config: '{ "file": "package.json", "pattern": "\\"private\\"", "negate": false }',
    description: "Pass if file matches pattern (negate inverts)",
  },
  {
    type: "json_field",
    config: '{ "file": "tsconfig.json", "field": "compilerOptions.strict", "expected": true }',
    description: "Pass if JSON field equals expected value",
  },
];

export function PolicyFormatDocs() {
  return <FormatDocs title="Policy Export Format" example={POLICY_EXAMPLE} fields={POLICY_FIELDS} />;
}

export function RuleFormatDocs() {
  return (
    <FormatDocs title="Rule Export Format" example={RULE_EXAMPLE} fields={RULE_FIELDS}>
      <div>
        <h4 className="text-sm font-medium mb-2">Config by Rule Type</h4>
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left p-2 font-medium">rule_type</th>
                <th className="text-left p-2 font-medium">config</th>
                <th className="text-left p-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {RULE_CONFIG_DOCS.map((d) => (
                <tr key={d.type}>
                  <td className="p-2 font-mono text-xs">{d.type}</td>
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{d.config}</td>
                  <td className="p-2 text-xs">{d.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FormatDocs>
  );
}
