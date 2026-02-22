"use client";

import { Button } from "@claudekit/ui/components/button";
import { RotateCcw, Save, Upload, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveClaudeSettingsJson, saveDefaultClaudeSettings } from "@/lib/actions/claude-config";

interface SettingsRawEditorProps {
  repoId: string;
  initialJson: string;
  jsonContent: string;
  onJsonChange: (json: string) => void;
  onSaved?: () => void;
}

export function SettingsRawEditor({ repoId, initialJson, jsonContent, onJsonChange, onSaved }: SettingsRawEditorProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validateJson = (text: string) => {
    try {
      JSON.parse(text);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  const handleBlur = () => {
    if (jsonContent.trim()) validateJson(jsonContent);
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonContent);
      const formatted = JSON.stringify(parsed, null, 2);
      onJsonChange(formatted);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveClaudeSettingsJson(repoId, jsonContent);
      toast.success("Settings saved!");
      onSaved?.();
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    onJsonChange(initialJson);
    setJsonError(null);
  };

  const handleSaveAsDefault = async () => {
    try {
      await saveDefaultClaudeSettings(jsonContent);
      toast.success("Saved as default settings!");
    } catch (e) {
      toast.error(`Failed to save default: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      {jsonError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          JSON Error: {jsonError}
        </div>
      )}
      <textarea
        value={jsonContent}
        onChange={(e) => onJsonChange(e.target.value)}
        onBlur={handleBlur}
        className="w-full h-80 font-mono text-sm p-4 rounded-lg border bg-muted/30 resize-y focus:outline-hidden focus:ring-2 focus:ring-primary/50"
        spellCheck={false}
        placeholder='{ "permissions": { ... } }'
      />
      <div className="sticky bottom-0 bg-background border-t py-3 -mx-1 px-1 flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !!jsonError} size="sm">
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button variant="outline" onClick={formatJson} size="sm">
          <Wand2 className="w-4 h-4 mr-2" />
          Format
        </Button>
        <Button variant="ghost" onClick={handleReset} size="sm">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset
        </Button>
        <Button variant="outline" onClick={handleSaveAsDefault} disabled={!!jsonError} size="sm">
          <Upload className="w-4 h-4 mr-2" />
          Save as Default
        </Button>
      </div>
    </div>
  );
}
