import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratorProject } from "@/lib/types";

// Maps vibe IDs to design traits
export const VIBE_TRAITS: Record<string, { spacing: string; typography: string; radius: string; patterns: string }> = {
  "precision-density": {
    spacing: "Compact spacing scale (2px base). Dense information layout. Minimal padding.",
    typography: "System mono or Inter Tight. Small base size (13-14px). Tight line-height.",
    radius: "Sharp corners (2-4px radius). Squared-off elements.",
    patterns: "Data tables, status indicators, compact cards, split panels, keyboard shortcuts.",
  },
  "warmth-approachability": {
    spacing: "Generous spacing (8px base). Breathing room between elements.",
    typography: "Rounded sans-serif (Nunito, Quicksand). Larger base (16-18px). Relaxed line-height.",
    radius: "Rounded corners (12-16px radius). Pill-shaped buttons.",
    patterns: "Illustration accents, friendly empty states, progress celebrations, soft shadows.",
  },
  "sophistication-trust": {
    spacing: "Balanced spacing (6px base). Deliberate whitespace.",
    typography: "Elegant sans-serif (Inter, DM Sans). Medium base (15-16px). Measured tracking.",
    radius: "Subtle rounding (6-8px). Refined borders.",
    patterns: "Muted color palette, fine dividers, premium card layouts, subtle hover states.",
  },
  "boldness-clarity": {
    spacing: "Clear spacing (6px base). Strong visual separation.",
    typography: "High-impact font (Cal Sans, Plus Jakarta). Bold headings. Clear hierarchy.",
    radius: "Medium rounding (8px). Consistent across components.",
    patterns: "Strong CTAs, high-contrast sections, bold typography, clear information hierarchy.",
  },
  "utility-function": {
    spacing: "Efficient spacing (4px base). No wasted space.",
    typography: "System UI font stack. Standard base (14-15px). Functional sizing.",
    radius: "Minimal rounding (4px). Tool-like appearance.",
    patterns: "Command palettes, keyboard-first navigation, minimal chrome, functional layouts.",
  },
  "data-analysis": {
    spacing: "Grid-aligned spacing (4px base). Dashboard density.",
    typography: "Tabular numerics (JetBrains Mono for data, Inter for labels). Mixed sizing.",
    radius: "Subtle rounding (4-6px). Card-based containers.",
    patterns: "Chart containers, metric cards, data grids, filter bars, time-range selectors.",
  },
  retro: {
    spacing: "Pixel-aligned spacing. Deliberate grid alignment.",
    typography: "Pixel or monospace fonts. Fixed-width where possible.",
    radius: "Zero or very small radius. Pixelated aesthetic.",
    patterns: "Retro borders, pixel art accents, terminal-style elements, scan-line effects.",
  },
  playful: {
    spacing: "Bouncy spacing (8px base). Asymmetric layouts allowed.",
    typography: "Fun display fonts (Fredoka, Baloo). Larger sizes. Expressive weights.",
    radius: "Large rounding (16-20px). Blob shapes. Organic forms.",
    patterns: "Confetti, animations, color gradients, emoji accents, hover surprises.",
  },
};

// Maps vibe IDs to structured design system properties
const VIBE_SYSTEM: Record<
  string,
  {
    personality: string;
    foundation: string;
    depth: string;
    baseSpacing: number;
    radiusScale: string;
    typographyStack: string;
  }
> = {
  "precision-density": {
    personality: "Precision & Density",
    foundation: "Cool (slate)",
    depth: "Borders-only",
    baseSpacing: 4,
    radiusScale: "2px / 4px / 6px",
    typographyStack: "Inter Tight, system-ui, monospace for data",
  },
  "warmth-approachability": {
    personality: "Warmth & Approachability",
    foundation: "Warm (amber/sand)",
    depth: "Subtle shadows",
    baseSpacing: 8,
    radiusScale: "8px / 12px / 16px",
    typographyStack: "Nunito, Quicksand, rounded sans-serif",
  },
  "sophistication-trust": {
    personality: "Sophistication & Trust",
    foundation: "Cool (slate/zinc)",
    depth: "Layered shadows",
    baseSpacing: 6,
    radiusScale: "4px / 6px / 8px",
    typographyStack: "Inter, DM Sans, elegant sans-serif",
  },
  "boldness-clarity": {
    personality: "Boldness & Clarity",
    foundation: "Neutral",
    depth: "Subtle shadows",
    baseSpacing: 6,
    radiusScale: "4px / 8px / 12px",
    typographyStack: "Cal Sans, Plus Jakarta Sans, high-impact sans-serif",
  },
  "utility-function": {
    personality: "Utility & Function",
    foundation: "Neutral (gray)",
    depth: "Borders-only",
    baseSpacing: 4,
    radiusScale: "2px / 4px / 6px",
    typographyStack: "system-ui, -apple-system, sans-serif",
  },
  "data-analysis": {
    personality: "Data & Analysis",
    foundation: "Cool (slate)",
    depth: "Borders-only",
    baseSpacing: 4,
    radiusScale: "4px / 6px / 8px",
    typographyStack: "Inter for labels, JetBrains Mono for data",
  },
  retro: {
    personality: "Retro",
    foundation: "Neutral",
    depth: "Borders-only",
    baseSpacing: 4,
    radiusScale: "0px / 2px / 4px",
    typographyStack: "monospace, pixel fonts, fixed-width",
  },
  playful: {
    personality: "Playful",
    foundation: "Warm",
    depth: "Subtle shadows",
    baseSpacing: 8,
    radiusScale: "8px / 16px / 20px",
    typographyStack: "Fredoka, Baloo, fun display sans-serif",
  },
};

export function buildInterfaceDesignSystem(project: GeneratorProject): string {
  const sections: string[] = [];

  sections.push(`# Interface Design System
## Project: ${project.title}
Generated design system — every value is a design decision, not a default.`);

  // Direction section
  const vibes = project.design_vibes || [];
  if (vibes.length > 0) {
    const directionParts: string[] = ["## Direction"];
    for (const vibeId of vibes) {
      const system = VIBE_SYSTEM[vibeId];
      const traits = VIBE_TRAITS[vibeId];
      if (!system || !traits) continue;
      directionParts.push(`### ${system.personality}
- **Foundation:** ${system.foundation}
- **Depth strategy:** ${system.depth}
- **Base spacing:** ${system.baseSpacing}px (all spacing as multiples of this)
- **UI patterns:** ${traits.patterns}`);
    }
    sections.push(directionParts.join("\n\n"));
  }

  // Tokens section
  const scheme = project.color_scheme || {};
  const primaryVibe = vibes[0];
  const system = primaryVibe ? VIBE_SYSTEM[primaryVibe] : undefined;

  const tokenParts: string[] = ["## Tokens"];

  // Spacing scale
  const base = system?.baseSpacing ?? 4;
  tokenParts.push(`### Spacing
- Base unit: ${base}px
- Scale: ${base}px / ${base * 2}px / ${base * 3}px / ${base * 4}px / ${base * 6}px / ${base * 8}px
- Micro: ${base}px (icon gaps, tight pairs)
- Component: ${base * 2}px–${base * 3}px (inside buttons, cards)
- Section: ${base * 4}px–${base * 6}px (between groups)
- Major: ${base * 8}px+ (between distinct areas)`);

  // Color primitives
  if (scheme.primary || scheme.accent) {
    tokenParts.push(`### Color Primitives
${scheme.primary ? `- **Brand primary:** ${scheme.primary} — primary buttons, links, active states, focus rings` : ""}
${scheme.accent ? `- **Brand accent:** ${scheme.accent} — secondary actions, highlights, badges` : ""}
- **Foreground:** primary (high contrast), secondary (muted), tertiary (metadata), muted (disabled)
- **Background:** base canvas, surface-100 (cards), surface-200 (dropdowns), surface-300 (overlays)
- **Border:** default (rgba, low opacity), subtle (nearly invisible), strong (emphasis), focus (ring)
- **Semantic:** destructive (red), warning (amber), success (green), info (blue)

Configure in Tailwind/CSS:
${scheme.primary ? `- \`--primary: ${scheme.primary}\` (convert to HSL for Tailwind v4)` : ""}
${scheme.accent ? `- \`--accent: ${scheme.accent}\` (convert to HSL for Tailwind v4)` : ""}
- Derive hover/active/disabled variants from these primitives
- Ensure WCAG AA contrast ratios`);
  }

  // Radius scale
  if (system) {
    tokenParts.push(`### Border Radius
- Scale: ${system.radiusScale}
- Small: inputs, buttons
- Medium: cards, panels
- Large: modals, containers`);
  }

  // Typography
  if (system) {
    tokenParts.push(`### Typography
- Stack: ${system.typographyStack}
- Headline: heavier weight, tight letter-spacing
- Body: comfortable weight, readable line-height
- Label: medium weight, works at small sizes
- Data: monospace, \`font-variant-numeric: tabular-nums\``);
  }

  sections.push(tokenParts.join("\n\n"));

  // Patterns section
  if (system) {
    const depthCSS =
      system.depth === "Borders-only"
        ? `border: 0.5px solid rgba(0, 0, 0, 0.08); /* light mode */
border: 0.5px solid rgba(255, 255, 255, 0.06); /* dark mode */`
        : system.depth === "Subtle shadows"
          ? `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
border: 0.5px solid rgba(0, 0, 0, 0.05);`
          : `box-shadow:
  0 0 0 0.5px rgba(0, 0, 0, 0.05),
  0 1px 2px rgba(0, 0, 0, 0.04),
  0 2px 4px rgba(0, 0, 0, 0.03),
  0 4px 8px rgba(0, 0, 0, 0.02);`;

    sections.push(`## Patterns

### Button
- Height: ${base * 9}px
- Padding: ${base * 2}px ${base * 4}px
- Radius: ${system.radiusScale.split(" / ")[0]}
- Font: 14px, 500 weight

### Card
- Padding: ${base * 4}px
- Radius: ${system.radiusScale.split(" / ")[1]}
- Depth: ${system.depth}
\`\`\`css
${depthCSS}
\`\`\`

### Sidebar
- Same background as canvas (not different color)
- Subtle border for separation
- Width determined by content hierarchy`);
  }

  // Inspiration URLs
  const urls = project.inspiration_urls || [];
  if (urls.length > 0) {
    sections.push(`## Inspiration References
${urls.map((url) => `- ${url}`).join("\n")}

Study these references for design cues: layout patterns, color usage, typography choices, spacing rhythm, and interaction patterns.`);
  }

  // Decisions table
  if (system) {
    sections.push(`## Decisions

| Choice | Value | Why |
|--------|-------|-----|
| Depth | ${system.depth} | Matches ${system.personality.toLowerCase()} personality |
| Base spacing | ${base}px | ${base <= 4 ? "Dense layout for information-heavy interfaces" : base >= 8 ? "Generous breathing room for approachable feel" : "Balanced density for professional clarity"} |
| Foundation | ${system.foundation} | Sets the color temperature for all surfaces |
| Typography | ${system.typographyStack.split(",")[0]} | ${base <= 4 ? "Functional and space-efficient" : base >= 8 ? "Warm and inviting" : "Refined and trustworthy"} |
| Radius | ${system.radiusScale.split(" / ")[0]} base | ${system.radiusScale.startsWith("0") || system.radiusScale.startsWith("2") ? "Sharp, technical feel" : Number.parseInt(system.radiusScale, 10) >= 8 ? "Rounded, friendly feel" : "Subtle refinement"} |`);
  }

  sections.push(`## Implementation Notes
- Every token must trace to a primitive — no random hex values
- Surface elevation: barely different, still distinguishable
- Borders: low opacity rgba, disappear when not looking for them
- All interactive elements need hover, focus, active, disabled states
- Test in both light and dark modes if dark mode is enabled`);

  return sections.join("\n\n");
}

export function writeInterfaceDesignFile(projectDir: string, content: string): void {
  const designDir = path.join(projectDir, ".interface-design");
  fs.mkdirSync(designDir, { recursive: true });
  fs.writeFileSync(path.join(designDir, "system.md"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Skill file bundling
// ---------------------------------------------------------------------------

const SKILL_FILES = [
  "SKILL.md",
  "references/principles.md",
  "references/validation.md",
  "references/critique.md",
  "references/example.md",
];

function getSkillBundleDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), "interface-design-skill");
}

export function writeSkillFiles(projectDir: string): void {
  const srcDir = getSkillBundleDir();
  const destDir = path.join(projectDir, ".claude", "skills", "interface-design");

  for (const relPath of SKILL_FILES) {
    const srcPath = path.join(srcDir, relPath);
    const destPath = path.join(destDir, relPath);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const content = fs.readFileSync(srcPath, "utf-8");
    fs.writeFileSync(destPath, content, "utf-8");
  }
}
