import { Camera } from "lucide-react";
import { motion } from "framer-motion";
import { pageEnter, ease } from "@/lib/motion";

export default function Snapshots() {
  return (
    <motion.div {...pageEnter} className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Snapshots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Point-in-time repository state comparisons</p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4, ease }}
          className="bg-card border border-card-border rounded-lg p-16 text-center"
        >
          <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-sm font-medium text-foreground">Snapshots coming soon</p>
          <p className="text-xs text-muted-foreground mt-1">Capture and compare repository states over time</p>
        </motion.div>
      </div>
    </motion.div>
  );
}
