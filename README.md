# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/masch3nny/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/masch3nny/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token protocols by implied value: a category multiple read off the snapshot's own live-token protocols (median market-cap/TVL per category, winsorized and shrunk toward the global median), times growth, maturity and chain spread. It covers all 40 protocols on the watchlist plus 163 more rankable pre-token protocols below the floor, 203 rows in all, each with a concrete seven-step farm plan with costs and times. The dashboard is a static page — sortable, filterable board, a detail view per protocol with its model breakdown, and a live-token view — with no network at render time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=n0kxzsaa&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
