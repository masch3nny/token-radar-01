// Radar-2: one sealed snapshot in, one ranked launch radar out.
//
// A protocol's launch is the token it may issue one day. This module asks
// what such a token would be worth if the protocol kept its current record,
// and what a reader should do to farm the protocol meanwhile. It never
// predicts whether or when a token appears: every implied value below is
// the model's own claim, derived only from the snapshot's own figures.
//
// The pricing idea is simple. The market already values the kind of
// protocol in front of us: live-token protocols in the same category carry
// a market-cap-to-TVL ratio, and the median of those ratios is the
// category's own multiple. Growth over seven days, how long the protocol
// has run without a token, and how many chains it spans adjust that
// multiple up or down. Nothing here names a protocol, and no multiple is
// typed in by hand: the snapshot supplies every number the model uses.
//
// The dashboard calls a protocol "pre-token" only in the record's sense:
// the snapshot carries no token for it. That is a fact about the record,
// never a promise that no token exists.

/** One protocol entry exactly as the sealed snapshot carries it. */
export type Proto = {
  tvl_usd: number;
  slug: string;
  name: string;
  chains: string[];
  category: string | null;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
};

/** The sealed snapshot document as a whole. */
export type Snap = {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
};

/** Every knob the radar-2 model turns, in one place, so the dashboard can show them. */
export type Tuning = {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_min_mult: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  mult_floor: number;
  mult_cap: number;
  mult_shrink: number;
  ratio_cap: number;
  chain_step: number;
  chain_max: number;
};

export const TUNING: Tuning = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  growth_min_mult: 0.6,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1460,
  unknown_age_days: 365,
  mult_floor: 0.08,
  mult_cap: 0.9,
  mult_shrink: 10,
  ratio_cap: 2,
  chain_step: 0.02,
  chain_max: 5,
};

/** The label the dashboard prints next to the model's numbers. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's live view carries. */
export const LIVE_ROWS = 24;

/** One farm step before it is flattened into a single board string. */
export type Step = {
  body: string;
  price: string;
  span: string;
};

/** One row of the ranked board, as board.json carries it. */
export type BoardEntry = {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chains_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
};

/** The dashboard's compact form of a board row, without the farm plan text. */
export type CompactEntry = {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chains_multiplier: number;
};

/** A protocol whose token already trades, shown at the market's own value. */
export type LiveEntry = {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
};

/** Everything the dashboard page needs, as data.js carries it. */
export type RadarPayload = {
  as_of: string;
  source: string;
  floor_usd: number;
  model: Tuning;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  category_multiples: Record<string, number>;
  rows: CompactEntry[];
  live: LiveEntry[];
};

/** Thrown when the snapshot on disk is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

/** Whole days between two UTC-midnight dates, never below zero; null when either side is missing or unparseable. */
export function daysSince(asOf: string, listed: string | null): number | null {
  if (listed === null) return null;
  const start = Date.parse(`${listed}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

/** The middle value of a sorted list; the mean of the two middle values when the count is even. */
function middleOf(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A number rounded to four decimals, for the figures the board prints. */
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/** A finite number, or the fallback when the value is missing or not a number. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A name that ends in a release marker is a pool of another protocol, not a launch of its own. */
const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule itself leaves out: exchanges, bridges, staked products. */
const OFF_LIMIT = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** True when the record carries no token at all: no market cap, no CoinGecko id, no symbol. */
export function hasNoToken(p: Proto): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True when the board may rank this protocol: pre-token, in a launchable category, not a versioned pool. */
export function canRank(p: Proto): boolean {
  if (!hasNoToken(p)) return false;
  if (OFF_LIMIT.has(p.category ?? '')) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  return true;
}

/**
 * The market's own multiple per category, read off the snapshot: for each
 * category, the median market-cap-to-TVL of its live-token protocols, each
 * ratio capped first so one thinly-traded token cannot set its whole
 * category, then pulled toward the global median when the category has
 * few live comps. Categories with no live protocol at all take the global
 * median. The table is keyed in the order categories first appear in the
 * snapshot, null categories grouped under Other.
 */
export function multiplesFor(snap: Snap, tune: Tuning = TUNING): Record<string, number> {
  const order: string[] = [];
  for (const p of snap.protocols) {
    const key = p.category ?? 'Other';
    if (!order.includes(key)) order.push(key);
  }
  const buckets = new Map<string, number[]>();
  const every: number[] = [];
  for (const p of snap.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const capped = Math.min(p.mcap_usd / p.tvl_usd, tune.ratio_cap);
    if (!Number.isFinite(capped) || capped <= 0) continue;
    every.push(capped);
    const key = p.category ?? 'Other';
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [capped]);
    else bucket.push(capped);
  }
  const global = every.length > 0 ? middleOf([...every].sort((a, b) => a - b)) : 0.2;
  const table: Record<string, number> = {};
  for (const key of order) {
    const bucket = buckets.get(key) ?? [];
    const own = bucket.length > 0 ? middleOf([...bucket].sort((a, b) => a - b)) : global;
    const pulled = (bucket.length * own + tune.mult_shrink * global) / (bucket.length + tune.mult_shrink);
    table[key] = round4(Math.min(tune.mult_cap, Math.max(tune.mult_floor, pulled)));
  }
  return table;
}

/** The four factors behind one protocol's implied value, plus the value itself. */
export type Valuation = {
  value: number;
  multiple: number;
  growth: number;
  growthFactor: number;
  ageFactor: number;
  chainFactor: number;
  age: number | null;
};

/**
 * Price one protocol from the snapshot's own figures. The category
 * multiple comes from the table; growth is the seven-day TVL change
 * clamped and damped; maturity grows with the days the protocol has run
 * without a token; spanning more chains adds a little. The product is
 * rounded to whole dollars and never below one.
 */
export function valuate(
  p: Proto,
  asOf: string,
  table: Record<string, number>,
  tune: Tuning,
): Valuation {
  const age = daysSince(asOf, p.listed_at);
  const multiple = table[p.category ?? 'Other'] ?? table['Other'] ?? 0.2;
  const growth = Math.min(tune.growth_cap, Math.max(tune.growth_floor, numOr(p.change_7d, 0)));
  const growthFactor = Math.max(tune.growth_min_mult, 1 + (growth / 100) * tune.growth_weight);
  const ageDays = age ?? tune.unknown_age_days;
  const cappedAge = Math.min(Math.max(ageDays, 0), tune.maturity_days);
  const ageFactor = tune.maturity_floor + (cappedAge / tune.maturity_days) * tune.maturity_range;
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), tune.chain_max);
  const chainFactor = 1 + tune.chain_step * extraChains;
  const value = Math.max(1, Math.round(p.tvl_usd * multiple * growthFactor * ageFactor * chainFactor));
  return { value, multiple, growth, growthFactor, ageFactor, chainFactor, age };
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function firstChain(p: Proto): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function stakeSize(p: Proto): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One category rule: the substrings that select it, and the action it writes. */
type ActionRule = {
  keys: string[];
  make: (p: Proto, size: number, chain: string) => string;
};

/** The category actions, first matching rule wins, in the order the watchlist rule implies. */
const ACTION_RULES: ActionRule[] = [
  {
    keys: ['lend', 'cdp', 'collateral'],
    make: (p, size, chain) => {
      const again = p.chains.length > 1 ? `, and repeat the pair on ${p.chains[1]}` : '';
      return `Supply $${size} of USDC to ${p.name} on ${chain}, borrow a small amount against it${again}, then keep the position open.`;
    },
  },
  {
    keys: ['dex', 'yield', 'leveraged farm'],
    make: (p, size, chain) => `Provide $${size} of liquidity to ${p.name}'s main pool on ${chain}, stake the LP receipt if it offers one, and keep the position open.`,
  },
  {
    keys: ['bridge'],
    make: (p, size, chain) => `Bridge $${size} of USDC to ${chain} through ${p.name} and use the bridged funds in its app.`,
  },
  {
    keys: ['staking', 'restak'],
    make: (p, size) => `Stake $${size} of the chain's staking asset through ${p.name} and keep the receipt token in the same wallet.`,
  },
  {
    keys: ['perpetual', 'derivative', 'basis'],
    make: (p, size) => `Deposit $${size} of USDC as margin on ${p.name}, open one small hedged trade, and keep the margin posted.`,
  },
  {
    keys: ['prediction'],
    make: (p, size) => `Fund $${size} and place one market position on ${p.name}, then leave the outcome to settle.`,
  },
  {
    keys: ['curator', 'allocator', 'onchain capital'],
    make: (p, size, chain) => `Deposit $${size} into a ${p.name} vault on ${chain}, keep the vault shares, and check the vault's allocation report.`,
  },
  {
    keys: ['stable'],
    make: (p, size, chain) => `Mint or deposit $${size} of the stable asset through ${p.name} on ${chain} and hold the receipt.`,
  },
  {
    keys: ['rwa'],
    make: (p, size, chain) => `Mint $${size} of the protocol's yield-bearing asset on ${chain} and hold it through one yield payout.`,
  },
  {
    keys: ['insurance'],
    make: (p, size, chain) => `Buy $${size} of cover from ${p.name} on ${chain} and keep the policy active.`,
  },
  {
    keys: ['payment'],
    make: (p, size, chain) => `Pay $${size} through ${p.name} on ${chain} for a real invoice or transfer, and keep the receipt.`,
  },
  {
    keys: ['governance'],
    make: (p, size, chain) => `Deposit $${size} into ${p.name} on ${chain} and vote in its next governance round.`,
  },
  {
    keys: ['chain'],
    make: (p, size) => `Use $${size} on ${p.name}'s chain: send one transaction a week in its native app and keep the activity in one wallet.`,
  },
  {
    keys: ['cedefi'],
    make: (p, size, chain) => `Deposit $${size} of USDC into ${p.name} on ${chain} and keep the position through one rebalance.`,
  },
  {
    keys: ['privacy'],
    make: (p, size, chain) => `Deposit $${size} through ${p.name} on ${chain} and use its private transfer once, keeping the receipt.`,
  },
  {
    keys: ['index'],
    make: (p, size, chain) => `Buy $${size} of the ${p.name} index on ${chain} and hold the index token.`,
  },
];

/** The category's one action, in words a farmer can follow. */
function pickAction(p: Proto, size: number, chain: string): string {
  const cat = (p.category ?? '').toLowerCase();
  for (const rule of ACTION_RULES) {
    if (rule.keys.some((k) => cat.includes(k))) return rule.make(p, size, chain);
  }
  return `Deposit $${size} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** One weekly rule: the substrings that select it, and the small action it writes. */
type WeeklyRule = { keys: string[]; text: string };

/** The weekly qualifying actions, first matching rule wins. */
const WEEKLY_RULES: WeeklyRule[] = [
  { keys: ['lend', 'cdp', 'collateral'], text: 'adjust the supply or borrow by a small amount' },
  { keys: ['dex', 'yield'], text: 'add or remove a small amount of liquidity, or claim and restake the rewards' },
  { keys: ['perpetual', 'derivative', 'basis'], text: 'close and reopen one small hedged trade' },
  { keys: ['prediction'], text: 'place one small market position' },
  { keys: ['governance'], text: 'vote in an open proposal, or comment on one' },
  { keys: ['staking', 'restak'], text: 'restake the rewards, or add a small amount' },
];

/** The weekly qualifying action for a category, so the plan is not one deposit and silence. */
function pickWeekly(p: Proto): string {
  const cat = (p.category ?? '').toLowerCase();
  for (const rule of WEEKLY_RULES) {
    if (rule.keys.some((k) => cat.includes(k))) return rule.text;
  }
  return 'make one deposit, swap, vote or claim in the app';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function planFor(p: Proto, age: number | null): Step[] {
  const chain = firstChain(p);
  const size = stakeSize(p);
  const hold = holdFor(age);
  const action = pickAction(p, size, chain);
  const weekly = pickWeekly(p);
  const gas = size >= 150 ? 8 : 4;
  return [
    {
      body: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      price: 'under $3 of gas for the first transaction',
      span: '5 minutes',
    },
    {
      body: action,
      price: `$${size} of capital and about $${gas} of gas`,
      span: '15 minutes to set up',
    },
    {
      body: `Every week, ${weekly} so the wallet shows repeated use instead of one deposit.`,
      price: 'about $2 of gas a week',
      span: '10 minutes a week',
    },
    {
      body: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      price: `the $${size} stays in the position`,
      span: `${hold} days`,
    },
    {
      body: "Check the protocol's own points or rewards page weekly and note any task it lists; do only the tasks it publishes.",
      price: 'no fee to check',
      span: '10 minutes a week',
    },
    {
      body: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",
      price: 'no fee to check, and never pay to claim',
      span: '10 minutes',
    },
    {
      body: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
      price: 'nothing but the log',
      span: '5 minutes',
    },
  ];
}

/** One step as a single string: its action, then its cost and time. */
export function joinStep(step: Step): string {
  let out = `${step.body} Cost: ${step.price}. Time: ${step.span}.`;
  if (out.length > 600) out = `${out.slice(0, 596)}...`;
  if (out.length < 20) out = `${out} Hold the position and check the protocol's own page.`;
  return out;
}

/** The board's rows, strongest first, with ranks 1..N. */
export function assembleBoard(snap: Snap, tune: Tuning = TUNING): BoardEntry[] {
  const table = multiplesFor(snap, tune);
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const picked = new Map<string, Proto>();
  for (const slug of snap.watchlist) {
    const found = bySlug.get(slug);
    if (found !== undefined) picked.set(slug, found);
  }
  for (const p of snap.protocols) {
    if (!picked.has(p.slug) && canRank(p)) picked.set(p.slug, p);
  }
  const priced = [...picked.values()].map((p) => ({ p, worth: valuate(p, snap.as_of, table, tune) }));
  priced.sort((a, b) => b.worth.value - a.worth.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return priced.map((cand, i) => ({
    rank: i + 1,
    slug: cand.p.slug,
    name: cand.p.name,
    category: cand.p.category,
    chains: cand.p.chains,
    tvl_usd: cand.p.tvl_usd,
    change_7d: cand.p.change_7d,
    mcap_usd: cand.p.mcap_usd,
    listed_at: cand.p.listed_at,
    gecko_id: cand.p.gecko_id,
    symbol: cand.p.symbol,
    token_status: 'pre-token',
    watchlist: snap.watchlist.includes(cand.p.slug),
    age_days: cand.worth.age,
    implied_value_usd: cand.worth.value,
    model: {
      category_multiple: cand.worth.multiple,
      growth_pct: cand.worth.growth,
      growth_multiplier: round4(cand.worth.growthFactor),
      maturity_multiplier: round4(cand.worth.ageFactor),
      chains_multiplier: round4(cand.worth.chainFactor),
      age_days: cand.worth.age,
    },
    farm_steps: planFor(cand.p, cand.worth.age).map(joinStep),
  }));
}

/** A board row's compact form for data.js, with the farm plan left to the page. */
function compactEntry(row: BoardEntry): CompactEntry {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chains_multiplier: row.model.chains_multiplier,
  };
}

/** The live-token protocols, by market cap, for the dashboard's live view. */
export function liveList(snap: Snap): LiveEntry[] {
  return snap.protocols
    .filter((p) => !hasNoToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from one snapshot. */
export function assembleRadar(snap: Snap, tune: Tuning = TUNING): { board: BoardEntry[]; radar: RadarPayload } {
  const board = assembleBoard(snap, tune);
  const live = liveList(snap);
  const table = multiplesFor(snap, tune);
  const early = board.filter((row) => !snap.watchlist.includes(row.slug)).length;
  const radar: RadarPayload = {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    model: tune,
    model_version: MODEL_VERSION,
    watchlist_size: snap.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    category_multiples: table,
    rows: board.map(compactEntry),
    live,
  };
  return { board, radar };
}

/** A record-shaped value, or an error naming what it was meant to be. */
function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SnapshotError(`${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

/** A string field, or null when the field is absent or not a string. */
function strOrNull(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' ? (record[key] as string) : null;
}

/** A finite number field, or null when the field is absent or not a finite number. */
function numOrNull(record: Record<string, unknown>, key: string): number | null {
  const v = record[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function readSnapshot(text: string): Snap {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  const doc = asRecord(raw, 'snapshot.json');
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = doc.protocols.map((entry, i) => {
    const p = asRecord(entry, `snapshot.json's protocol ${i}`);
    if (typeof p.slug !== 'string' || typeof p.name !== 'string') {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug or a name`);
    }
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: strOrNull(p, 'category'),
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: numOrNull(p, 'change_7d'),
      mcap_usd: numOrNull(p, 'mcap_usd'),
      listed_at: strOrNull(p, 'listed_at'),
      gecko_id: strOrNull(p, 'gecko_id'),
      symbol: strOrNull(p, 'symbol'),
    };
  });
  return {
    as_of: doc.as_of,
    source: doc.source,
    floor_usd: doc.floor_usd,
    protocols,
    watchlist: doc.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null when it passes every check. */
export function checkBoard(board: BoardEntry[], snap: Snap): string | null {
  const slugs = new Set(board.map((row) => row.slug));
  const missing = snap.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const s of row.farm_steps) {
      if (s.length < 20 || s.length > 600) return `${row.slug} has a farm step of ${s.length} characters`;
    }
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `${row.slug} has implied value ${row.implied_value_usd}`;
    }
  }
  return null;
}

/** data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function payloadScript(radar: RadarPayload): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
