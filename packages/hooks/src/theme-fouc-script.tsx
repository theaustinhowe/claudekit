/**
 * Server component that renders an inline <script> to apply the saved color
 * theme class before React hydrates, preventing a flash of unstyled content.
 *
 * Place this in your root layout's <body> (before ThemeProvider) or <head>.
 */

interface ThemeFOUCScriptProps {
  /** localStorage key for the theme. Default: "claudekit-theme" */
  storageKey?: string;
}

export function ThemeFOUCScript({ storageKey = "claudekit-theme" }: ThemeFOUCScriptProps) {
  const script = `(function(){try{var k=${JSON.stringify(storageKey)};var s=localStorage.getItem(k);if(s&&s!=="amethyst")document.documentElement.classList.add("theme-"+s)}catch(e){}})()`;

  // biome-ignore lint/security/noDangerouslySetInnerHtml: Inline script for FOUC prevention, content is not user-controlled
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
