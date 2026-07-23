from app.importers.chat_exports import scan_chatgpt, scan_claude
from app.importers.projects_docs import scan_docs, scan_github

SCANNERS = {
    "chatgpt": scan_chatgpt,
    "claude": scan_claude,
    "github": scan_github,
    "docs": scan_docs,
}
