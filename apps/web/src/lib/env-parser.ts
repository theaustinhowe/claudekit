export interface EnvVariable {
  key: string;
  defaultValue: string;
  description: string;
  required: boolean;
  group: string;
  placeholder?: string;
  url?: string;
  hint?: string;
}

export interface EnvExampleFile {
  appId: string;
  label: string;
  variables: EnvVariable[];
}

export interface SharedVariable extends EnvVariable {
  sources: Array<{ appId: string; label: string }>;
}

export interface SetupWizardData {
  sharedVariables: SharedVariable[];
  appVariables: Record<string, { label: string; variables: EnvVariable[] }>;
  existingValues: Record<string, string>;
}

export interface SaveEnvResult {
  success: boolean;
  filesWritten: string[];
  errors: string[];
}

const PLACEHOLDER_PATTERN = /^your-.*-here$/;

/** Parse a `.env.example` file into structured variable definitions. */
export function parseEnvExample(content: string): EnvVariable[] {
  const lines = content.split("\n");
  const variables: EnvVariable[] = [];
  let commentBuffer: string[] = [];
  let currentGroup = "";
  let currentUrl: string | undefined;
  let currentHint: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank line — reset comment buffer
    if (!trimmed) {
      commentBuffer = [];
      currentUrl = undefined;
      currentHint = undefined;
      continue;
    }

    // Pure comment line — could be a group header, description, or directive
    if (trimmed.startsWith("#") && !trimmed.match(/^#\s*\w+=/) && !trimmed.match(/^#\s*[A-Z_]+=$/)) {
      const commentText = trimmed.replace(/^#\s*/, "");

      // Extract @url directive
      const urlMatch = commentText.match(/^@url\s+(.+)$/);
      if (urlMatch) {
        currentUrl = urlMatch[1].trim();
        continue;
      }

      // Extract @hint directive
      const hintMatch = commentText.match(/^@hint\s+(.+)$/);
      if (hintMatch) {
        currentHint = hintMatch[1].trim();
        continue;
      }

      // Detect group headers (short lines that look like section titles)
      if (
        commentText.match(/^(Required|Optional|MCP Server)/i) ||
        (commentText.length < 60 &&
          !commentText.includes("=") &&
          commentBuffer.length === 0 &&
          commentText.match(/^[A-Z]/))
      ) {
        currentGroup = commentText;
        commentBuffer = [];
      } else {
        commentBuffer.push(commentText);
      }
      continue;
    }

    // Commented-out variable line: # KEY=value or # KEY=
    const commentedMatch = trimmed.match(/^#\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (commentedMatch) {
      const key = commentedMatch[1];
      const rawValue = commentedMatch[2];
      const isPlaceholder = PLACEHOLDER_PATTERN.test(rawValue);
      variables.push({
        key,
        defaultValue: isPlaceholder ? "" : rawValue,
        description: commentBuffer.join(" "),
        required: false,
        group: currentGroup,
        ...(isPlaceholder ? { placeholder: rawValue } : {}),
        ...(currentUrl ? { url: currentUrl } : {}),
        ...(currentHint ? { hint: currentHint } : {}),
      });
      commentBuffer = [];
      currentUrl = undefined;
      currentHint = undefined;
      continue;
    }

    // Active variable line: KEY=value
    const activeMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (activeMatch) {
      const key = activeMatch[1];
      const rawValue = activeMatch[2];
      const isPlaceholder = PLACEHOLDER_PATTERN.test(rawValue);
      variables.push({
        key,
        defaultValue: isPlaceholder ? "" : rawValue,
        description: commentBuffer.join(" "),
        required: true,
        group: currentGroup,
        ...(isPlaceholder ? { placeholder: rawValue } : {}),
        ...(currentUrl ? { url: currentUrl } : {}),
        ...(currentHint ? { hint: currentHint } : {}),
      });
      commentBuffer = [];
      currentUrl = undefined;
      currentHint = undefined;
    }
  }

  return variables;
}

/** Merge variables across all env files, separating shared from app-specific. */
export function deduplicateVariables(files: EnvExampleFile[]): Omit<SetupWizardData, "existingValues"> {
  // Count occurrences of each key across files
  const keyToSources = new Map<string, Array<{ appId: string; label: string }>>();
  const keyToVars = new Map<string, EnvVariable[]>();

  for (const file of files) {
    for (const variable of file.variables) {
      const sources = keyToSources.get(variable.key) ?? [];
      sources.push({ appId: file.appId, label: file.label });
      keyToSources.set(variable.key, sources);

      const vars = keyToVars.get(variable.key) ?? [];
      vars.push(variable);
      keyToVars.set(variable.key, vars);
    }
  }

  const sharedVariables: SharedVariable[] = [];
  const appVariables: Record<string, { label: string; variables: EnvVariable[] }> = {};

  for (const [key, sources] of keyToSources) {
    const vars = keyToVars.get(key) ?? [];

    // Shared: appears in 2+ files OR is from root
    const isRoot = sources.some((s) => s.appId === "root");
    if (sources.length >= 2 || isRoot) {
      // Merge: take longest description, prefer required: true
      const merged: SharedVariable = {
        key,
        defaultValue: vars.find((v) => v.defaultValue)?.defaultValue ?? "",
        description: vars.reduce((best, v) => (v.description.length > best.length ? v.description : best), ""),
        required: vars.some((v) => v.required),
        group: vars[0].group,
        placeholder: vars.find((v) => v.placeholder)?.placeholder,
        url: vars.find((v) => v.url)?.url,
        hint: vars.find((v) => v.hint)?.hint,
        sources,
      };
      sharedVariables.push(merged);
    } else {
      // App-specific
      const source = sources[0];
      if (!appVariables[source.appId]) {
        appVariables[source.appId] = { label: source.label, variables: [] };
      }
      appVariables[source.appId].variables.push(vars[0]);
    }
  }

  return { sharedVariables, appVariables };
}
