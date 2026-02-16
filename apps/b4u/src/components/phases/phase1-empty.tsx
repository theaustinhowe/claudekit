"use client";

export function Phase1Empty() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      {/* Folder illustration */}
      <div className="w-[100px] h-[80px] mb-6 flex flex-col items-center justify-center bg-primary/10 rounded-xl">
        <div className="text-3xl mb-1" style={{ opacity: 0.8 }}>
          📂
        </div>
        <div className="text-2xs text-primary">your project</div>
      </div>

      <div className="text-sm font-medium mb-1 text-foreground">Select a project to begin</div>
      <div className="text-xs max-w-[240px] text-muted-foreground/70">
        Choose a local web app directory in the chat and B4U will scan its structure automatically.
      </div>
    </div>
  );
}
