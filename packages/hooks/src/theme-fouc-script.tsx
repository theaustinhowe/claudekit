/**
 * Server component that renders an inline <script> to apply the saved color
 * theme class before React hydrates, preventing a flash of unstyled content.
 *
 * Place this in your root layout's <body> (before ThemeProvider) or <head>.
 */

interface ThemeFOUCScriptProps {
  /** localStorage key for the theme. Default: "devkit-theme" */
  storageKey?: string;
  /** Legacy storage keys to migrate from. First match wins, value is moved to storageKey. */
  legacyKeys?: string[];
  /** Map legacy theme names to current names (e.g. { purple: "amethyst" }). */
  legacyThemeMap?: Record<string, string>;
}

export function ThemeFOUCScript({
  storageKey = "devkit-theme",
  legacyKeys = [],
  legacyThemeMap,
}: ThemeFOUCScriptProps) {
  const legacyMigration =
    legacyKeys.length > 0
      ? `var lk=${JSON.stringify(legacyKeys)};for(var i=0;i<lk.length;i++){var v=localStorage.getItem(lk[i]);if(v){${
          legacyThemeMap ? `var m=${JSON.stringify(legacyThemeMap)};v=m[v]||v;` : ""
        }s=v;localStorage.setItem(k,v);localStorage.removeItem(lk[i]);break}}`
      : "";

  const script = `(function(){try{var k=${JSON.stringify(storageKey)};var s=localStorage.getItem(k);${legacyMigration}if(s&&s!=="amethyst")document.documentElement.classList.add("theme-"+s)}catch(e){}})()`;

  // biome-ignore lint/security/noDangerouslySetInnerHtml: Inline script for FOUC prevention, content is not user-controlled
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
