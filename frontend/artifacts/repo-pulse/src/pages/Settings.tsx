import { Settings2 } from "lucide-react";

export default function Settings() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Account and configuration preferences</p>
      </div>
      <div className="grid gap-3">
        {["Analysis Settings", "Notification Preferences", "Team Members", "API Keys", "Billing"].map((section) => (
          <div key={section} className="bg-card border border-card-border rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{section}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Configure your {section.toLowerCase()}</p>
            </div>
            <Settings2 className="w-4 h-4 text-muted-foreground" />
          </div>
        ))}
      </div>
    </div>
  );
}
