import { GitCompare } from "lucide-react";

export default function Compare() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Compare</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Compare risk metrics across repositories</p>
      </div>
      <div className="bg-card border border-card-border rounded-lg p-16 text-center">
        <GitCompare className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
        <p className="text-sm font-medium text-foreground">Comparison coming soon</p>
        <p className="text-xs text-muted-foreground mt-1">Side-by-side risk analysis across repositories</p>
      </div>
    </div>
  );
}
