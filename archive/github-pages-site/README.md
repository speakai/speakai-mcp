# The old mcp.speakai.co site

These files built the GitHub Pages site that used to serve `mcp.speakai.co`. They are kept for reference and are **not published**.

`mcp.speakai.co` now returns a Cloudflare 301 to `https://docs.speakai.co/mcp/`, so nothing here was reachable any more. The Pages workflow kept running on every push to `main` and publishing a site the redirect made unreachable, which is why it moved here rather than staying wired up.

| File | Was |
|---|---|
| `index.html` | The landing page, with the one-click install buttons |
| `tools.html` | The browsable tool list |
| `.nojekyll` | Told Pages to skip Jekyll processing |
| `deploy-pages.yml` | The workflow, previously at `.github/workflows/` |

## What replaced it

| Old | Now |
|---|---|
| `mcp.speakai.co` | [docs.speakai.co/mcp](https://docs.speakai.co/mcp/) |
| `mcp.speakai.co/tools.html` | [docs.speakai.co/mcp/tools/](https://docs.speakai.co/mcp/tools/) |
| One-click install buttons | [docs.speakai.co/mcp/setup/](https://docs.speakai.co/mcp/setup/), generated per client from `installs.json` |

The docs pages are generated from this repo's `tools.json` and `installs.json`, so they stay current without a second site to maintain.

## What deliberately stayed at the repo root

- **`CNAME`** still reads `mcp.speakai.co`. It is inert: GitHub Pages is unpublished and the custom domain has been cleared in repository settings, so nothing reads this file. It is kept only as a record of which host this repo used to own. The Cloudflare redirect does not depend on it.
- **`assets/`** is not Pages material. `installs.json` references the client setup screenshots in it and `README.md` uses the logo, so it is still live content.

## Do not restore this without a reason

Two things would have to be undone first, and neither is obvious from inside this repo:

1. **Cloudflare owns the hostname.** `mcp.speakai.co` returns a 301 to `docs.speakai.co/mcp/` from Cloudflare, before any request reaches GitHub. A restored Pages deploy would report success and serve nothing.
2. **Pages is unpublished** and the custom domain field is empty. Re-enabling Pages while `CNAME` is still present would re-claim `mcp.speakai.co` for GitHub and put it in conflict with the redirect.
