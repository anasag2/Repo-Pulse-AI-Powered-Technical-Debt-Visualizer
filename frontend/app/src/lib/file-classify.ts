import type { FileNode } from "@workspace/api-client-react";

// Extensions we treat as "programming" source — actual code, framework
// components, queries, and authored styles. Everything else (package.json,
// lockfiles, .md/.yml/.toml config, images, fonts, data) is considered noise
// for the technical-debt map and hidden by default.
const CODE_EXTENSIONS = new Set([
  // JS/TS
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  // Python / Ruby / Go / Rust / JVM
  "py", "pyi", "rb", "go", "rs", "java", "kt", "kts", "scala", "groovy", "clj", "cljs",
  // C family / .NET
  "c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx", "m", "mm", "cs", "fs", "vb",
  // Other languages
  "php", "pl", "pm", "lua", "r", "jl", "dart", "ex", "exs", "erl", "hrl", "hs", "ml", "mli", "swift",
  // Shell / SQL
  "sh", "bash", "zsh", "fish", "ps1", "sql",
  // Web components & authored styles
  "vue", "svelte", "astro", "css", "scss", "sass", "less", "styl", "html", "htm",
]);

// A few code/build files that carry no (or an unusual) extension.
const CODE_BASENAMES = new Set([
  "dockerfile", "makefile", "rakefile", "gemfile", "cmakelists.txt", "vagrantfile",
]);

// Vendored / generated / build dirs and generated/minified file suffixes — kept
// in sync with the backend's file_classify.is_excluded so the map's "Code only"
// view matches exactly what the technical-debt model scores.
const EXCLUDED_DIRS = new Set([
  "node_modules", "bower_components", "jspm_packages",
  "vendor", "third_party", "third-party", "godeps",
  "dist", "build", "out", "target", ".next", ".nuxt", ".svelte-kit", ".cache",
  "migrations", "generated", "__generated__",
  "coverage", ".venv", "venv", "site-packages", ".tox", ".eggs",
]);
const EXCLUDED_SUFFIXES = [
  ".min.js", ".min.css", ".min.mjs", ".bundle.js", ".bundle.css",
  "_pb2.py", "_pb2_grpc.py", ".pb.go", ".pb.cc", ".pb.h", ".g.dart", ".d.ts",
];

function isExcludedPath(path: string): boolean {
  const segments = path.replace(/\\/g, "/").split("/");
  if (segments.slice(0, -1).some((s) => EXCLUDED_DIRS.has(s.toLowerCase()))) return true;
  const name = (segments[segments.length - 1] ?? "").toLowerCase();
  return EXCLUDED_SUFFIXES.some((s) => name.endsWith(s)) || name.includes(".generated.");
}

/** Whether a file is the team's authored source (worth showing/scoring) —
 *  excludes vendored, generated, build, and minified files. */
export function isCodeFile(file: FileNode): boolean {
  if (file.isDirectory) return false;
  if (isExcludedPath(file.path)) return false;
  const name = file.name.toLowerCase();
  if (CODE_BASENAMES.has(name)) return true;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false; // no extension, or a dotfile like .eslintrc
  return CODE_EXTENSIONS.has(name.slice(dot + 1));
}
