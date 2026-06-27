import { useState } from "react";
import { useListRepositories, getListRepositoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Trash2, ExternalLink, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useDeleteRepository } from "@workspace/api-client-react";
import { useAnalysis } from "@/lib/analysis-context";
import { pageEnter, stagger, rise, ease } from "@/lib/motion";

function riskLabel(score: number) {
  if (score < 0.3) return "Low";
  if (score < 0.5) return "Medium";
  if (score < 0.7) return "High-Med";
  return "High";
}

function riskBadgeClass(score: number) {
  if (score < 0.3) return "bg-green-400/10 text-green-400 border border-green-400/20";
  if (score < 0.5) return "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20";
  if (score < 0.7) return "bg-orange-400/10 text-orange-400 border border-orange-400/20";
  return "bg-red-400/10 text-red-400 border border-red-400/20";
}

export default function Repositories() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { data: repos, isLoading } = useListRepositories();
  const deleteRepo = useDeleteRepository();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { startAnalysis, status: analysisStatus } = useAnalysis();
  const isAnalyzing = analysisStatus === "running";

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<{ name: string; url: string; isPublic: boolean }>({
    defaultValues: { name: "", url: "", isPublic: true },
  });

  const filtered = repos?.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.url.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const onSubmit = (data: { name: string; url: string; isPublic: boolean }) => {
    // Hand off to the global analysis flow: it navigates to the dashboard and
    // shows the progress overlay, then routes to the new repo when done.
    startAnalysis(data);
    reset();
    setShowForm(false);
  };

  const handleDelete = (id: number, name: string) => {
    deleteRepo.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRepositoriesQueryKey() });
          toast({ title: "Deleted", description: `${name} removed.` });
        },
      }
    );
  };

  return (
    <motion.div {...pageEnter} className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Repositories</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{repos?.length ?? 0} repositories analyzed</p>
          </div>
          <button
            onClick={() => setShowForm((f) => !f)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            data-testid="button-new-repository"
          >
            <Plus className="w-4 h-4" />
            Analyze New
          </button>
        </div>

        {/* Add form */}
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease }}
              className="overflow-hidden"
            >
              <div className="bg-card border border-card-border rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Analyze a Repository</h3>
                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-3">
                  <input
                    {...register("name", { required: true })}
                    placeholder="Repository name (e.g. awesome-project)"
                    className="flex-1 bg-muted/50 border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    data-testid="input-repo-name"
                  />
                  <input
                    {...register("url", { required: true })}
                    placeholder="github.com/username/repo"
                    className="flex-1 bg-muted/50 border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    data-testid="input-repo-url"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || isAnalyzing}
                    className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                    data-testid="button-submit-analyze"
                  >
                    {isAnalyzing ? "Analyzing..." : "Analyze"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories... (⌘K)"
            type="search"
            className="w-full bg-card border border-card-border rounded-md pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid="input-search-repositories"
          />
        </div>

        {/* List */}
        <div className="bg-card border border-card-border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Loading repositories...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">
                {search ? "No repositories match your search" : "No repositories yet. Analyze one to get started."}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Repository</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5 hidden sm:table-cell">Files</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5 hidden md:table-cell">Risky</th>
                  <th className="text-center text-xs text-muted-foreground font-medium px-3 py-2.5">Risk</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5 hidden lg:table-cell">Coverage</th>
                  <th className="text-right text-xs text-muted-foreground font-medium px-3 py-2.5 hidden md:table-cell">Last Analyzed</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <motion.tbody variants={stagger} initial="hidden" animate="show" className="divide-y divide-card-border">
                {filtered.map((repo) => (
                  <motion.tr variants={rise} key={repo.id} className="hover:bg-muted/20 transition-colors" data-testid={`repo-row-${repo.id}`}>
                    <td className="px-4 py-3">
                      <Link href={`/repositories/${repo.id}`}>
                        <div className="cursor-pointer">
                          <div className="text-sm font-medium text-foreground hover:text-primary transition-colors">{repo.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <ExternalLink className="w-3 h-3" />
                            {repo.url}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-foreground hidden sm:table-cell">
                      {repo.totalFiles.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right hidden md:table-cell">
                      <span className="text-xs text-red-400">
                        {repo.riskyFiles} <span className="text-muted-foreground">({repo.riskyFilesPercent}%)</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", riskBadgeClass(repo.avgRiskScore))}>
                        {riskLabel(repo.avgRiskScore)} {repo.avgRiskScore}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs hidden lg:table-cell">
                      <span className={repo.testCoverage >= 60 ? "text-green-400" : repo.testCoverage >= 40 ? "text-yellow-400" : "text-red-400"}>
                        {repo.testCoverage}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-muted-foreground hidden md:table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        {repo.lastAnalyzed}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => handleDelete(repo.id, repo.name)}
                        className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                        data-testid={`button-delete-repo-${repo.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          )}
        </div>
      </div>
    </motion.div>
  );
}
