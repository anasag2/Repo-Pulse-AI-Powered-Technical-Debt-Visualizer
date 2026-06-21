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

/** Whether a file is a programming/source file worth showing on the map. */
export function isCodeFile(file: FileNode): boolean {
  if (file.isDirectory) return false;
  const name = file.name.toLowerCase();
  if (CODE_BASENAMES.has(name)) return true;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false; // no extension, or a dotfile like .eslintrc
  return CODE_EXTENSIONS.has(name.slice(dot + 1));
}
