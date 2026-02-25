import { Table2 } from "lucide-react";

export default function TablesIndexPage() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <div className="text-center space-y-2">
        <Table2 className="h-10 w-10 mx-auto opacity-30" />
        <p className="text-sm">Select a table from the sidebar</p>
      </div>
    </div>
  );
}
