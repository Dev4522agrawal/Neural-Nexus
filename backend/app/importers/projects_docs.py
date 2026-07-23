"""Importers for local project folders (github/) and documents (docs/).

A project folder needs no README: we compose its story from manifests
(tech stack), the file tree (shape), commit log (history), and README if
present. Docs: .md/.txt read directly, .pdf via pypdf text extraction.
"""

import subprocess
from pathlib import Path

from app.importers.base import IMPORTS_DIR, ImportItem

SKIP_DIRS = {
    "node_modules", ".venv", "venv", "dist", "build", "__pycache__",
    ".next", ".git", "coverage", "target", ".idea", ".vscode",
}
MANIFESTS = [
    "package.json", "requirements.txt", "pyproject.toml", "Cargo.toml",
    "go.mod", "pom.xml", "build.gradle", "composer.json", "Gemfile",
]
CODE_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".rs", ".go", ".java", ".c", ".cpp", ".html", ".css"}


def _tree(root: Path, max_entries: int = 120) -> list[str]:
    entries: list[str] = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts):
            continue
        if len(rel.parts) > 3 or not path.is_file():
            continue
        entries.append(str(rel))
        if len(entries) >= max_entries:
            entries.append("… (truncated)")
            break
    return entries


def _commits(root: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "log", "--oneline", "--no-decorate", "-n", "40"],
            capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip() if out.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def scan_github() -> list[ImportItem]:
    items: list[ImportItem] = []
    root = IMPORTS_DIR / "github"
    if not root.exists():
        return items
    for project in sorted(p for p in root.iterdir() if p.is_dir()):
        sections = [f"Project folder: {project.name}"]

        readmes = [p for p in project.glob("README*") if p.is_file()]
        if readmes:
            sections.append("README:\n" + readmes[0].read_text(encoding="utf-8", errors="ignore")[:4000])

        for name in MANIFESTS:
            mpath = project / name
            if mpath.is_file():
                sections.append(f"{name}:\n" + mpath.read_text(encoding="utf-8", errors="ignore")[:2000])

        tree = _tree(project)
        if tree:
            sections.append("File tree:\n" + "\n".join(tree))

        commits = _commits(project)
        if commits:
            sections.append("Commit history (newest first):\n" + commits)

        # A taste of the code itself: first ~2 significant source files
        code_samples = 0
        for path in sorted(project.rglob("*")):
            if code_samples >= 2:
                break
            rel = path.relative_to(project)
            if any(part in SKIP_DIRS or part.startswith(".") for part in rel.parts):
                continue
            if path.is_file() and path.suffix in CODE_EXT and path.stat().st_size > 500:
                sections.append(
                    f"Source sample ({rel}):\n" + path.read_text(encoding="utf-8", errors="ignore")[:2500]
                )
                code_samples += 1

        if len(sections) > 1:
            items.append(
                ImportItem(
                    source="github",
                    external_id=project.name,
                    title=f"Project: {project.name}",
                    content="\n\n".join(sections),
                    source_description=f"imported project folder ({project.name})",
                )
            )
    return items


def _pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)[:20000]
    except Exception:
        return ""


def scan_docs() -> list[ImportItem]:
    items: list[ImportItem] = []
    root = IMPORTS_DIR / "docs"
    if not root.exists():
        return items
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        if path.suffix.lower() in (".md", ".txt"):
            text = path.read_text(encoding="utf-8", errors="ignore").strip()
        elif path.suffix.lower() == ".pdf":
            text = _pdf_text(path).strip()
        else:
            continue
        if len(text) < 40:
            continue
        items.append(
            ImportItem(
                source="docs",
                external_id=str(path.relative_to(root)),
                title=path.stem.replace("_", " ").replace("-", " "),
                content=f"Document: {path.name}\n\n{text}",
                source_description=f"imported document ({path.name})",
            )
        )
    return items
