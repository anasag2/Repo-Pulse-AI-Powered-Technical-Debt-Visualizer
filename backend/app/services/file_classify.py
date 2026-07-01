"""
Classify a file as programming/source ("code") vs. everything else (configs,
lockfiles, docs, data, assets). Mirrors the frontend `isCodeFile` so the TD model
and findings score the same set the "Code only" map view shows. Non-code files
are still stored/visualised — they're just excluded from technical-debt scoring,
matching the thesis (which analysed source files only).
"""
import os

_CODE_EXTENSIONS = {
    # JS/TS
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    # Python / Ruby / Go / Rust / JVM
    "py", "pyi", "rb", "go", "rs", "java", "kt", "kts", "scala", "groovy", "clj", "cljs",
    # C family / .NET
    "c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx", "m", "mm", "cs", "fs", "vb",
    # Other languages
    "php", "pl", "pm", "lua", "r", "jl", "dart", "ex", "exs", "erl", "hrl", "hs", "ml", "mli", "swift",
    # Shell / SQL
    "sh", "bash", "zsh", "fish", "ps1", "sql",
    # Web components & authored styles
    "vue", "svelte", "astro", "css", "scss", "sass", "less", "styl", "html", "htm",
}

_CODE_BASENAMES = {
    "dockerfile", "makefile", "rakefile", "gemfile", "cmakelists.txt", "vagrantfile",
}


def is_code_file(path: str) -> bool:
    """True if `path` is a programming/source file worth scoring for debt."""
    name = os.path.basename(path).lower()
    if name in _CODE_BASENAMES:
        return True
    dot = name.rfind(".")
    if dot <= 0:  # no extension, or a dotfile like .eslintrc
        return False
    return name[dot + 1:] in _CODE_EXTENSIONS


# Vendored / generated / build directories — same spirit as SonarQube/CodeScene
# analysis-scope exclusions. Matched as a full path segment.
_EXCLUDED_DIRS = {
    "node_modules", "bower_components", "jspm_packages",
    "vendor", "third_party", "third-party", "godeps",
    "dist", "build", "out", "target", ".next", ".nuxt", ".svelte-kit", ".cache",
    "migrations", "generated", "__generated__",
    "coverage", ".venv", "venv", "site-packages", ".tox", ".eggs",
}

# Generated / minified file suffixes (bundlers, protobuf, type decls, etc.).
_EXCLUDED_SUFFIXES = (
    ".min.js", ".min.css", ".min.mjs", ".bundle.js", ".bundle.css",
    "_pb2.py", "_pb2_grpc.py", ".pb.go", ".pb.cc", ".pb.h", ".g.dart", ".d.ts",
)


def is_excluded(path: str) -> bool:
    """Vendored, generated, or build output — never the team's authored source."""
    norm = path.replace("\\", "/")
    segments = norm.split("/")
    if any(seg.lower() in _EXCLUDED_DIRS for seg in segments[:-1]):
        return True
    name = segments[-1].lower()
    return name.endswith(_EXCLUDED_SUFFIXES) or ".generated." in name


def is_analyzable(path: str) -> bool:
    """A code file that is actually the team's source (not vendored/generated).
    This is the set the TD model and findings should score."""
    return is_code_file(path) and not is_excluded(path)
