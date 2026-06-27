import { Settings2 } from "lucide-react";
import { motion } from "framer-motion";
import { pageEnter, stagger, rise } from "@/lib/motion";

export default function Settings() {
  const sections = ["Analysis Settings", "Notification Preferences", "Team Members", "API Keys", "Billing"];
  return (
    <motion.div {...pageEnter} className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Account and configuration preferences</p>
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3">
          {sections.map((section) => (
            <motion.div
              key={section}
              variants={rise}
              className="bg-card border border-card-border rounded-lg px-4 py-3 flex items-center justify-between transition-colors hover:border-emerald-400/30"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{section}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Configure your {section.toLowerCase()}</p>
              </div>
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
