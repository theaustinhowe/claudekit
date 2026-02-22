import type { Severity } from "./types";

interface ClassificationResult {
  severity: Severity;
  category: string;
}

const SEVERITY_KEYWORDS: Record<Severity, RegExp[]> = {
  blocking: [
    /\bbug\b/i,
    /\bbreak(s|ing)?\b/i,
    /\bcrash(es|ing)?\b/i,
    /\bsecurity\b/i,
    /\bvulnerab/i,
    /\bmust\s+(fix|change|update)/i,
    /\bcritical\b/i,
    /\bblocking\b/i,
    /\bdata\s*loss/i,
    /\brace\s*condition/i,
    /\bnull\s*pointer/i,
    /\bundefined\b.*\berror\b/i,
    /\binjection\b/i,
    /\bXSS\b/i,
  ],
  suggestion: [
    /\bshould\b/i,
    /\bconsider\b/i,
    /\bmight\s+want/i,
    /\bcould\b/i,
    /\brefactor/i,
    /\bimprove/i,
    /\bextract/i,
    /\bsimplif/i,
    /\bbetter\s+(to|if|way)/i,
    /\bprefer\b/i,
    /\bideally\b/i,
    /\boptional/i,
  ],
  nit: [
    /\bnit\b/i,
    /\bnitpick/i,
    /\btypo/i,
    /\bspelling/i,
    /\bwhitespace/i,
    /\bformatting/i,
    /\bstyle\b/i,
    /\bnaming\b/i,
    /\brename\b/i,
    /\bminor\b/i,
    /\btrivial\b/i,
  ],
};

const CATEGORY_KEYWORDS: Record<string, RegExp[]> = {
  "Error Handling": [
    /\berror\s*handl/i,
    /\btry\s*[/-]?\s*catch/i,
    /\bexception/i,
    /\bthrow/i,
    /\bunhandled/i,
    /\bfallback/i,
    /\berror\s*boundary/i,
  ],
  "Test Coverage": [
    /\btest(s|ing)?\b/i,
    /\bunit\s*test/i,
    /\bcoverage/i,
    /\bassert/i,
    /\bmock/i,
    /\bspec\b/i,
    /\btestable/i,
  ],
  "Naming Conventions": [
    /\bnam(e|ing)\b/i,
    /\brename/i,
    /\bconvention/i,
    /\bcamelCase/i,
    /\bsnake_case/i,
    /\bPascalCase/i,
    /\bdescriptive\b/i,
    /\bclarity\b/i,
  ],
  "Type Safety": [
    /\btype(s|d)?\b/i,
    /\btyping/i,
    /\bany\b/i,
    /\binterface\b/i,
    /\bgeneric/i,
    /\bcast(ing)?\b/i,
    /\bassertion/i,
    /\bnull\s*check/i,
    /\bundefined\b/i,
  ],
  "API Design": [
    /\bapi\b/i,
    /\bendpoint/i,
    /\brest\b/i,
    /\bschema\b/i,
    /\bcontract/i,
    /\bvalidat/i,
    /\bpayload/i,
    /\brequest\b/i,
    /\bresponse\b/i,
  ],
  Performance: [
    /\bperform/i,
    /\boptimi[sz]/i,
    /\bslow\b/i,
    /\bmemory\b/i,
    /\bleak/i,
    /\bcach(e|ing)/i,
    /\bO\(n/i,
    /\bcomplex(ity)?\b/i,
    /\bexpensive\b/i,
    /\bbatch/i,
  ],
};

export function classifyComment(body: string): ClassificationResult {
  const severity = classifySeverity(body);
  const category = classifyCategory(body);
  return { severity, category };
}

function classifySeverity(body: string): Severity {
  // Check blocking first (highest priority)
  for (const pattern of SEVERITY_KEYWORDS.blocking) {
    if (pattern.test(body)) return "blocking";
  }
  // Then nit (to avoid over-classifying nits as suggestions)
  for (const pattern of SEVERITY_KEYWORDS.nit) {
    if (pattern.test(body)) return "nit";
  }
  // Then suggestion
  for (const pattern of SEVERITY_KEYWORDS.suggestion) {
    if (pattern.test(body)) return "suggestion";
  }
  // Default to suggestion
  return "suggestion";
}

function classifyCategory(body: string): string {
  let bestCategory = "General";
  let bestScore = 0;

  for (const [category, patterns] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(body)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}
