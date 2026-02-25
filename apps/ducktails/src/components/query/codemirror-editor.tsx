"use client";

import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
} from "@codemirror/view";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

// Base styles applied regardless of theme — handles layout/sizing
const baseStyles = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    padding: "8px 0",
  },
  ".cm-gutters": {
    border: "none",
  },
  ".cm-completionLabel": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  },
});

const lightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--card-foreground))",
    },
    ".cm-content": {
      caretColor: "hsl(var(--foreground))",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "hsl(var(--foreground))",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "hsl(var(--accent))",
    },
    ".cm-activeLine": {
      backgroundColor: "hsl(var(--muted) / 0.5)",
    },
    ".cm-gutters": {
      backgroundColor: "hsl(var(--muted))",
      color: "hsl(var(--muted-foreground))",
      borderRight: "1px solid hsl(var(--border))",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "hsl(var(--muted))",
    },
    ".cm-tooltip": {
      backgroundColor: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "calc(var(--radius) - 2px)",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "hsl(var(--accent))",
      color: "hsl(var(--accent-foreground))",
    },
    ".cm-panels": {
      backgroundColor: "hsl(var(--muted))",
      color: "hsl(var(--foreground))",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid hsl(var(--border))",
    },
    ".cm-searchMatch": {
      backgroundColor: "hsl(var(--accent) / 0.4)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "hsl(var(--accent))",
    },
  },
  { dark: false },
);

const darkThemeOverrides = EditorView.theme(
  {
    ".cm-tooltip": {
      backgroundColor: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "calc(var(--radius) - 2px)",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "hsl(var(--accent))",
      color: "hsl(var(--accent-foreground))",
    },
  },
  { dark: true },
);

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  schema?: Record<string, string[]>;
}

export function CodeMirrorEditor({ value, onChange, onRun, schema }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const schemaRef = useRef(schema);
  const resolvedThemeRef = useRef<string | undefined>(undefined);
  const themeCompartment = useRef(new Compartment());
  const schemaCompartment = useRef(new Compartment());
  const { resolvedTheme } = useTheme();

  onRunRef.current = onRun;
  onChangeRef.current = onChange;
  valueRef.current = value;
  schemaRef.current = schema;
  resolvedThemeRef.current = resolvedTheme;

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const runKeyBinding = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          onRunRef.current();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        baseStyles,
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightSelectionMatches(),
        placeholderExt("SELECT * FROM ..."),
        runKeyBinding,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        schemaCompartment.current.of(
          sql({ dialect: PostgreSQL, schema: schemaRef.current ?? {}, upperCaseKeywords: true }),
        ),
        themeCompartment.current.of(
          resolvedThemeRef.current === "dark"
            ? [oneDark, darkThemeOverrides]
            : [lightTheme, syntaxHighlighting(defaultHighlightStyle)],
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Sync theme changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const isDark = resolvedTheme === "dark";
    view.dispatch({
      effects: themeCompartment.current.reconfigure(
        isDark ? [oneDark, darkThemeOverrides] : [lightTheme, syntaxHighlighting(defaultHighlightStyle)],
      ),
    });
  }, [resolvedTheme]);

  // Sync schema changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: schemaCompartment.current.reconfigure(
        sql({ dialect: PostgreSQL, schema: schema ?? {}, upperCaseKeywords: true }),
      ),
    });
  }, [schema]);

  // Sync external value changes (e.g. history click)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full" />;
}
