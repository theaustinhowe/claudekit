"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { Input } from "@claudekit/ui/components/input";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FEATURE_CATEGORIES } from "@/lib/constants";

interface FeaturesInputProps {
  selectedFeatures: string[];
  customFeatures: string[];
  onFeaturesChange: (features: string[]) => void;
  onCustomChange: (custom: string[]) => void;
}

export function FeaturesInput({
  selectedFeatures,
  customFeatures,
  onFeaturesChange,
  onCustomChange,
}: FeaturesInputProps) {
  const [inputValue, setInputValue] = useState("");

  const toggleFeature = (id: string) => {
    if (selectedFeatures.includes(id)) {
      onFeaturesChange(selectedFeatures.filter((f) => f !== id));
    } else {
      onFeaturesChange([...selectedFeatures, id]);
    }
  };

  const addCustom = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (customFeatures.includes(trimmed)) {
      toast.info("Feature already added");
      return;
    }

    if (customFeatures.length >= 10) {
      toast.info("Maximum 10 custom features allowed");
      return;
    }

    onCustomChange([...customFeatures, trimmed]);
    setInputValue("");
  };

  const removeCustom = (feature: string) => {
    onCustomChange(customFeatures.filter((f) => f !== feature));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {FEATURE_CATEGORIES.map((category) => (
          <div key={category.label}>
            <p className="text-xs text-muted-foreground mb-1.5">{category.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {category.features.map((feature) => (
                <Badge
                  key={feature.id}
                  variant={selectedFeatures.includes(feature.id) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleFeature(feature.id)}
                >
                  {feature.label}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add custom feature..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {customFeatures.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customFeatures.map((feature) => (
            <Badge key={feature} variant="secondary" className="gap-1 pr-1">
              {feature}
              <button
                type="button"
                onClick={() => removeCustom(feature)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label="Remove feature"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
