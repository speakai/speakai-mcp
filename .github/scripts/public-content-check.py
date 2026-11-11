#!/usr/bin/env python3
"""Public content check: fails when a pull request or a push adds internal references or tooling files to this repo.

Needs only Python 3 and git (npm too, to list the published package). No secret: it reads the GitHub Actions
event and runs on:
  pull_request  the lines the pull request adds or changes, its title, description and commit messages, the names
                of the files it adds, and every file `npm pack` would publish.
  push          the same for commits pushed to the default branch. A push cannot be undone; the failed run is the
                alarm.
`--all` checks every tracked file as if it were added, for a first scan of a repo.

It flags any word speak-<name> or speakai-<name> and any github.com/speakai/<name> link whose name is not one of
the public repos below or a product word in NAME_ALLOW, internal and preview links, local paths, a PRD: line,
agent tooling paths and files, Slack, Sentry and security report links, AWS account ids and ARNs, and
credential-shaped strings. It prints the file, the line, the kind and an id, never the matched text.
A pull request that changes this script, its workflow, the allow file or .gitattributes gets a check-change
finding that only a public-ok line clears. Files that are not valid UTF-8 are reported for a look by hand,
except common binary types by extension (BINARY_EXTENSIONS).
Not checked: customer names; this needs a private list. Also not checked: names that do not start with speak,
and the content of skipped binary types.

Waiver: a line `public-ok: <id> <reason>` in the PR description passes the findings with that id. A credential
cannot be waived. Files that are meant to be public but have a flagged name (a neutral CLAUDE.md, a plugin
manifest folder) go in .github/public-content-allow.txt, one glob per line; a pull request uses the base
branch's copy, so it cannot allow its own files.
"""
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

# BEGIN public repos generated from policy/repos.txt
PUBLIC_SLUGS = ("speakai/apps", "speakai/helpdesk-integration", "speakai/n8n-nodes-speakai", "speakai/pipedream", "speakai/speak-python-boilerplate", "speakai/speak-shared", "speakai/speakai-mcp", "speakai/ui")
# END generated
ORG = "speakai"
PUBLIC_NAMES = {s.split("/")[1] for s in PUBLIC_SLUGS}
# Product words of the form speak-<name> that are not repo names, each with its reason.
NAME_ALLOW = frozenset((
    "speak-ai",             # the product name, as a keyword or a test server name
    "speak-ui",             # the old name of the public UI library
    "speak-upload",         # the upload step in the public automation API
    "speak-sets",           # the public label sets endpoint, /v1/labels/speak-sets
    "speak-embed-session",  # the browser channel name the public embed tracker uses
    "speak-logo",           # the logo files on the public docs site
    "speak-supported",      # prose: a Speak-supported model
    "speakai-openai",       # a temporary folder prefix in a build script
    "speak-api-key",        # the placeholder for a user's API key in the docs
))
ALLOW_FILE = ".github/public-content-allow.txt"
SELF_PATH = ".github/scripts/public-content-check.py"
# A change to the check, its allow list or how git reads files needs a person's explicit waiver.
POLICY_FILES = (ALLOW_FILE, SELF_PATH, ".github/workflows/public-content-check.yml", ".gitattributes")
# Real binaries are skipped quietly; any other file that is not valid UTF-8 is reported for a look.
BINARY_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".eot",
                     ".pdf", ".mp3", ".mp4", ".wav", ".webm", ".mov", ".zip", ".gz", ".tgz")
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
MAX_FILE_BYTES = 2000000
UNWAIVABLE = ("credential",)
WAIVER = re.compile(r"public-ok:\s*([\w:.-]+)\s+\S", re.I)
# Copied from the agent-side leak check so both read text the same way; a test keeps them equal.
ZERO_WIDTH = re.compile("[­᠎​-‏‪-‮⁠-⁤﻿]")
DASHES = re.compile("[_‐-―−﹘﹣－]")
LOOK_ALIKES = str.maketrans("аеорсухіѕԁӏкмтнвј"
                            "αορεκντυι",
                            "aeopcyxisdlkmthbjaopekntui")
# BEGIN patterns: in this file, lines up to END patterns are checked for credentials only.
# A hyphenated word that starts with the product or org name, not inside a longer word or a path segment.
REPO_WORD = re.compile(r"(?<![a-z0-9.-])speak(?:ai)?(?:-[a-z0-9]+)+")
GITHUB_LINK = re.compile(r"github\.com/+%s/+([\w.-]+)" % ORG)
# (id, pattern, label), matched on the normalised (lowercased) line.
PATTERNS = (
    ("pages-dev", re.compile(r"[\w-]+\.pages\.dev"), "a pages.dev preview link"),
    ("workers-dev", re.compile(r"[\w-]+\.workers\.dev"), "a workers.dev preview link"),
    ("artifact-link", re.compile(r"claude\.ai/(?:code/)?artifact"), "a claude.ai artifact link"),
    ("local-path", re.compile(r"~/\.claude|\.claude/jobs"), "a local path"),
    ("prd-line", re.compile(r"(?:^|[\"'=])[\s>*-]*prd:"), "a PRD: line"),
    ("tooling", re.compile(r"\.claude/hooks"), "an agent tooling path"),
    ("slack-link", re.compile(r"[\w-]+\.slack\.com/archives/|app\.slack\.com/client/"), "a Slack archive link"),
    ("sentry-link", re.compile(r"sentry\.io/(?:organizations/[\w-]+/)?issues/\d|[\w-]+\.sentry\.io/issues/"),
     "a Sentry issue link"),
    ("security-report", re.compile(r"app\.aikido\.dev/"), "a security report link"),
    # The negative lookahead skips the placeholder account id used in AWS's own docs.
    ("aws-arn", re.compile(r"arn:aws[\w-]*:[\w-]+:[\w-]*:(?!12345678901[2])\d{12}:"), "an AWS ARN with an account id"),
    ("aws-account", re.compile(r"\b(?!12345678901[2])\d{12}\.dkr\.ecr\.|account[\s-]*id\W{0,5}(?!12345678901[2])\d{12}\b"),
     "an AWS account id"),
)
# (id, pattern, label), matched on the original line because case matters.
RAW_PATTERNS = (
    # A Mac home folder; the lowercase form is an everyday API path.
    ("local-path", re.compile(r"(?<![\w.-])/[U]sers/[\w.-]+/"), "a local path"),
    ("slack-id", re.compile(r"\b[CG]0[A-Z0-9]{8,10}\b"), "a Slack channel id"),
    ("credential", re.compile(r"mongodb(?:\+srv)?://[^\s:@/]+:[^\s@/]+@|AKIA[0-9A-Z]{16}|sk_(?:live|test)_[0-9A-Za-z]{24,}"
                              r"|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|xox[abprs]-[0-9A-Za-z-]{10,}"),
     "a credential-shaped string"),
)
# (id, pattern, label) for the names of added files: agent tooling and plans stay out of public repos.
PATH_RULES = (
    ("agent-files", re.compile(r"(?:^|/)(?:\.claude|\.codex|\.cursor|\.agents)/"), "an agent tooling folder"),
    ("agent-files", re.compile(r"(?:^|/)(?:AGENTS|CLAUDE)\.md$|(?:^|/)\.cursorrules$"), "an agent instructions file"),
    ("plans", re.compile(r"^plans/"), "a plans folder"),
)
# END patterns
ENV_FILE = re.compile(r"(?:^|/)\.env(?:\.[\w.-]+)?$")
ENV_TEMPLATE = re.compile(r"\.(?:example|sample|template|dist)$")
ENV_VALUE = re.compile(r"^\s*(?:export\s+)?[A-Za-z_]\w*\s*=\s*\S", re.M)


def normalise(text):
    text = ZERO_WIDTH.sub("", unicodedata.normalize("NFKC", text)).translate(LOOK_ALIKES).lower()
    return DASHES.sub("-", text)


def is_public_name(word):
    """True when the word, or one of its leading parts (speakai-mcp-server), is a public repo or product word."""
    parts = word.split("-")
    return any("-".join(parts[:k]) in PUBLIC_NAMES | NAME_ALLOW for k in range(2, len(parts) + 1))


def line_findings(line):
    """(id, label) pairs for one line of text; ids never contain the matched text."""
    low = normalise(line)
    found = []
    # An underscore joins constant and env names (SPEAK_API_KEY), which are code, not repo names.
    if any(not is_public_name(w) for w in REPO_WORD.findall(normalise(line.replace("_", " ")))):
        found.append(("repo-name", "a name that looks like a non-public repo or system"))
    if any(re.sub(r"\.git$", "", n.rstrip(".")) not in PUBLIC_NAMES for n in GITHUB_LINK.findall(low)):
        found.append(("repo-link", "a link to a non-public %s repo, issue or pull request" % ORG))
    found += [(fid, label) for fid, pattern, label in PATTERNS if pattern.search(low)]
    found += [(fid, label) for fid, pattern, label in RAW_PATTERNS if pattern.search(line)]
    return list(dict.fromkeys(found))


def git_bytes(*args):
    out = subprocess.run(["git", "-c", "core.quotePath=false", "--literal-pathspecs"] + list(args), capture_output=True)
    if out.returncode != 0:
        raise SystemExit("public-content-check: git %s failed, so the check cannot pass: %s"
                         % (" ".join(args), out.stderr.decode(errors="replace")[:300]))
    return out.stdout


def git(*args):
    return git_bytes(*args).decode("utf-8", errors="replace")


def is_utf8(data, cut_short):
    """True when the bytes are UTF-8; a file read only in part may end inside a character."""
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return cut_short and exc.start >= len(data) - 3
    return True


def resolves(ref):
    return bool(ref) and subprocess.run(["git", "rev-parse", "--verify", "-q", ref + "^{commit}"],
                                        capture_output=True).returncode == 0


def added_lines(diff_text):
    """{new line number: text} for the added lines of a one-file diff; None when it has no hunk."""
    lines, new_line, seen_hunk = {}, 0, False
    for row in diff_text.splitlines():
        if row.startswith("@@"):
            m = re.match(r"@@ -\S+ \+(\d+)", row)
            if not m:
                raise SystemExit("public-content-check: cannot read a diff hunk header, so the check cannot pass: %r" % row[:80])
            new_line, seen_hunk = int(m.group(1)), True
        elif not seen_hunk:
            continue
        elif row.startswith("+"):
            lines[new_line] = row[1:]
            new_line += 1
        elif row.startswith(" "):
            new_line += 1
    return lines if seen_hunk else None


def read_text(path):
    try:
        with open(path, "rb") as fh:
            data = fh.read(MAX_FILE_BYTES)
    except OSError:
        return None
    return data.decode("utf-8", errors="replace")


class Scan(object):
    def __init__(self, root, allow_text):
        self.root, self.records, self.notes = root, {}, []
        self.allowed = [g.strip() for g in (allow_text or "").splitlines() if g.strip() and not g.strip().startswith("#")]

    def is_allowed(self, path):
        return any(fnmatch.fnmatch(path, g) or (g.endswith("/") and path.startswith(g)) for g in self.allowed)

    def add(self, where, line_no, fid, label):
        self.records.setdefault((where, line_no, fid), label)

    def text(self, where, text):
        for n, line in enumerate(text.splitlines(), 1):
            for fid, label in line_findings(line):
                self.add(where, n, fid, label)

    def file(self, path, lines=None):
        """Scans a file in the work tree: every line, or only the given {line number: text}."""
        if path.lower().endswith(BINARY_EXTENSIONS):
            return
        if lines is None:
            try:
                with open(os.path.join(self.root, path), "rb") as fh:
                    data = fh.read(MAX_FILE_BYTES)
            except OSError:
                return
            self.check_utf8(path, data, len(data) == MAX_FILE_BYTES)
            lines = dict(enumerate(data.decode("utf-8", errors="replace").splitlines(), 1))
        own_rules = set()
        text = read_text(os.path.join(self.root, path)) if path == SELF_PATH else ""
        if text and "\n# BEGIN patterns" in text and "\n# END patterns" in text:
            start = text.count("\n", 0, text.find("\n# BEGIN patterns")) + 2
            end = text.count("\n", 0, text.find("\n# END patterns")) + 2
            own_rules = set(range(start, end + 1))
        for n, line in lines.items():
            found = line_findings(line)
            for fid, label in (f for f in found if f[0] in UNWAIVABLE) if n in own_rules else found:
                self.add(path, n, fid, label)

    def check_utf8(self, path, data, cut_short):
        if not is_utf8(data, cut_short) and not self.is_allowed(path):
            self.add(path, 0, "unreadable", "an added file that is not text, to check by hand")

    def names(self, paths):
        for path in paths:
            if self.is_allowed(path):
                continue
            for fid, pattern, label in PATH_RULES:
                if pattern.search(path):
                    self.add(path, 0, fid, label)
            if ENV_FILE.search(path) and not ENV_TEMPLATE.search(path):
                text = read_text(os.path.join(self.root, path))
                if text is None or ENV_VALUE.search(text):
                    self.add(path, 0, "env-file", "a .env file with values")

    def diff(self, spec):
        """Scans the added and changed lines of `git diff <spec>`, path by path, and the names of added files."""
        changed = [p for p in git("diff", "--name-only", "--diff-filter=d", "-z", spec).split("\0") if p]
        for path in changed:
            if path in POLICY_FILES:
                self.add(path, 0, "check-change", "a change to the content check or its allow list")
            if path.lower().endswith(BINARY_EXTENSIONS):
                continue
            # --text reads files git would call binary, so a NUL byte cannot hide added text.
            data = git_bytes("diff", "--text", "--no-color", "--no-ext-diff", "-U0", spec, "--", path)
            lines = added_lines(data.decode("utf-8", errors="replace"))
            if lines is None:
                self.file(path)
            else:
                self.check_utf8(path, data, False)
                self.file(path, lines)
        self.names([p for p in git("diff", "--name-only", "--diff-filter=A", "-z", spec).split("\0") if p])

    def commits(self, rev_range):
        for entry in git("log", "--format=%H%n%B%x1e", rev_range).split("\x1e"):
            sha, _, message = entry.strip("\n").partition("\n")
            if sha:
                self.text("commit %s message" % sha[:7], message)

    def npm_pack(self):
        """Scans every file npm would publish, when package.json publishes and npm runs."""
        package = os.path.join(self.root, "package.json")
        if not os.path.exists(package):
            return
        try:
            with open(package, "rb") as fh:
                original = fh.read()
            manifest = json.loads(original.decode("utf-8"))
        except (OSError, ValueError) as exc:
            self.notes.append("npm pack skipped: package.json could not be read (%s)" % exc)
            return
        if manifest.get("private") is True:
            return
        if not shutil.which("npm"):
            self.notes.append("npm pack skipped: npm is not installed")
            return
        # npm 10 still runs the prepare script with --ignore-scripts, so the scripts are removed while it lists.
        manifest.pop("scripts", None)
        try:
            with open(package, "w", encoding="utf-8") as fh:
                json.dump(manifest, fh, indent=2)
            out = subprocess.run(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], cwd=self.root,
                                 capture_output=True, timeout=180)
            files = [f["path"] for f in json.loads(out.stdout.decode("utf-8", errors="replace"))[0]["files"]]
        except (subprocess.TimeoutExpired, ValueError, LookupError, TypeError) as exc:
            self.notes.append("npm pack skipped: it did not list the package files (%s)" % type(exc).__name__)
            return
        finally:
            with open(package, "wb") as fh:
                fh.write(original)
        for path in files:
            self.file(path)
        self.notes.append("npm pack: checked %d published files" % len(files))


def waivers_in(text):
    return {m.group(1).lower() for m in WAIVER.finditer(text or "")}


def pr_bodies_for(shas):
    """Descriptions of the PRs that hold these commits, for waivers on a push (needs gh and a token)."""
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not (repo and shutil.which("gh") and (os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN"))):
        return ""
    bodies = []
    for sha in shas[:50]:
        out = subprocess.run(["gh", "api", "repos/%s/commits/%s/pulls" % (repo, sha), "--jq", ".[].body"],
                             capture_output=True, timeout=30)
        bodies.append(out.stdout.decode("utf-8", errors="replace") if out.returncode == 0 else "")
    return "\n".join(bodies)


def main(argv):
    root = git("rev-parse", "--show-toplevel").strip()
    os.chdir(root)
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    event = {}
    if os.environ.get("GITHUB_EVENT_PATH"):
        with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as fh:
            event = json.load(fh)
    base = ""
    if event_name == "pull_request":
        pr = event["pull_request"]
        base = "origin/" + pr["base"]["ref"]
        base = base if resolves(base) else pr["base"]["ref"] if resolves(pr["base"]["ref"]) else pr["base"]["sha"]
    # A pull request uses the base branch's allow list, so it cannot allow its own files.
    allow_text = read_text(os.path.join(root, ALLOW_FILE))
    if base and allow_text is not None:
        if subprocess.run(["git", "cat-file", "-e", "%s:%s" % (base, ALLOW_FILE)], capture_output=True).returncode == 0:
            allow_text = git("show", "%s:%s" % (base, ALLOW_FILE))
        else:
            print("::notice::The base branch has no %s yet, so this pull request's copy is used." % ALLOW_FILE)
    scan, waivers = Scan(root, allow_text), set()
    if "--all" in argv:
        files = [p for p in git("ls-files", "-z").split("\0") if p]
        for path in files:
            scan.file(path)
        scan.names(files)
    elif event_name == "pull_request":
        head = pr["head"]["sha"] if resolves(pr["head"]["sha"]) else "HEAD"
        scan.diff("%s...HEAD" % base)
        scan.commits("%s..%s" % (base, head))
        scan.text("PR title", pr.get("title") or "")
        scan.text("PR description", pr.get("body") or "")
        waivers = waivers_in(pr.get("body"))
    elif event_name == "push":
        before, after = event.get("before", ""), event.get("after") or "HEAD"
        if resolves(before):
            scan.diff("%s..%s" % (before, after))
            scan.commits("%s..%s" % (before, after))
        else:
            scan.diff("%s..%s" % (EMPTY_TREE, after))
            for c in event.get("commits", []):
                scan.text("commit %s message" % c.get("id", "")[:7], c.get("message", ""))
        shas = [c.get("id", "") for c in event.get("commits", []) if c.get("id")]
        waivers = waivers_in("\n".join(c.get("message", "") for c in event.get("commits", [])) + pr_bodies_for(shas))
    else:
        print("public-content-check: run it from a pull_request or push workflow, or with --all")
        return 2
    scan.npm_pack()

    failed, passed = [], []
    for (where, line_no, fid), label in sorted(scan.records.items()):
        waived = fid in waivers and not fid.startswith(UNWAIVABLE)
        place = "%s:%d" % (where, line_no) if line_no else where
        (passed if waived else failed).append("  %s: %s (%s)" % (place, label, fid))
        if not waived and line_no and not where.startswith(("PR ", "commit ")):
            print("::error file=%s,line=%d::%s (%s)" % (where, line_no, label, fid))
    for note in scan.notes:
        print("public-content-check: " + note)
    if passed:
        print("Waived in the PR description:\n" + "\n".join(passed))
    if not failed:
        print("public-content-check: no internal names or links found")
        return 0
    print("public-content-check: %d finding(s). This repo is public, so describe the change in neutral words and "
          "remove internal names, links and agent files:\n%s" % (len(failed), "\n".join(failed)))
    print("If one must stay, add a line to the PR description: public-ok: <id> <reason>. Credentials cannot be "
          "waived. Files meant to be public can be listed in %s." % ALLOW_FILE)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
