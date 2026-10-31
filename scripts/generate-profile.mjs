// プロフィール README の画像を生成する。
// 公開情報だけを読み、assets/ に SVG を書き出す。
// 取得に失敗したらエラーで止まるので、前回の画像がそのまま残る。

import { mkdir, readFile, writeFile } from "node:fs/promises";

const USER = "yoshiki0405";
const TAGLINE = "TypeScript  ·  Next.js  ·  Ebisu";
const OUT_DIR = new URL("../assets/", import.meta.url);
const ICONS = JSON.parse(await readFile(new URL("./icons.json", import.meta.url), "utf8"));

const WIDTH = 882;
const GAP = 14;
const FONT = `system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;

const THEMES = {
  dark: {
    surface: "#0d1117",
    border: "#30363d",
    tile: "#161b22",
    ink: "#f0f6fc",
    secondary: "#c9d1d9",
    muted: "#8b949e",
    accent: "#3987e5",
    track: "#21262d",
  },
  light: {
    surface: "#ffffff",
    border: "#d0d7de",
    tile: "#f6f8fa",
    ink: "#1f2328",
    secondary: "#59636e",
    muted: "#59636e",
    accent: "#2a78d6",
    track: "#e6eaef",
  },
};

// ランク名と、トロフィーの色（基準は下の TROPHIES に書いた自分用の目安）
const RANKS = [
  { name: "C", color: "#8b949e" },
  { name: "B", color: "#c08457" },
  { name: "A", color: "#9fb1c6" },
  { name: "S", color: "#e3b341" },
  { name: "SS", color: "#a371f7" },
];

const TROPHIES = [
  { title: "Contributor", key: "total", unit: "contributions", steps: [100, 500, 1000, 5000] },
  { title: "Regular", key: "activeDays", unit: "active days", steps: [30, 100, 300, 1000] },
  { title: "On a Roll", key: "longestStreak", unit: "day streak", steps: [3, 7, 14, 30] },
  { title: "Peak Day", key: "bestDay", unit: "in one day", steps: [10, 30, 50, 100] },
  { title: "Best Year", key: "bestYear", unit: "in one year", steps: [100, 300, 600, 1200] },
  { title: "Veteran", key: "years", unit: "years on GitHub", steps: [1, 3, 5, 10] },
];

const STACK = [
  ["TypeScript", "typescript", "#3178c6"],
  ["JavaScript", "javascript", "#d9b600"],
  ["React", "react", "#23a9c9"],
  ["Next.js", "nextdotjs", null],
  ["Tailwind", "tailwindcss", "#06b6d4"],
  ["Notion", "notion", null],
  ["HTML", "html5", "#e34f26"],
  ["CSS", "css3", "#2f6fd6"],
];

const LINKS = [
  { file: "link-x", label: "", name: "X", icon: "x", color: "#000000", w: 44 },
  { file: "link-zenn", label: "Zenn", name: "Zenn", icon: "zenn", color: "#1f7fd6", w: 86 },
  { file: "link-note", label: "note", name: "note", icon: null, color: "#0f8f7c", w: 66 },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function fetchProfile() {
  const headers = { "User-Agent": `${USER}-profile-card`, Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/users/${USER}`, { headers });
  if (!res.ok) throw new Error(`profile: HTTP ${res.status}`);
  return res.json();
}

async function fetchYear(year) {
  const res = await fetch(`https://github.com/users/${USER}/contributions?from=${year}-01-01&to=${year}-12-31`, {
    headers: { "User-Agent": `${USER}-profile-card` },
  });
  if (!res.ok) throw new Error(`contributions ${year}: HTTP ${res.status}`);
  const html = await res.text();

  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>\s*(\d+|No) contributions? on/g)) {
    counts.set(m[1], m[2] === "No" ? 0 : Number(m[2]));
  }

  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*>/g)) {
    const date = m[0].match(/data-date="(\d{4}-\d{2}-\d{2})"/)?.[1];
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    if (!date || !id) continue;
    if (!counts.has(id)) throw new Error(`contributions: ${date} の件数が読めない`);
    if (date.startsWith(String(year))) days.push({ date, count: counts.get(id) });
  }
  if (days.length < 300) throw new Error(`contributions ${year}: ${days.length} 日分しか読めない`);
  return days;
}

function summarize(days, profile) {
  const today = new Date().toISOString().slice(0, 10);
  const past = days.filter((d) => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));

  const byYear = new Map();
  const byWeekday = Array(7).fill(0);
  let longestStreak = 0;
  let streak = 0;
  for (const d of past) {
    const year = d.date.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + d.count);
    byWeekday[new Date(`${d.date}T00:00:00Z`).getUTCDay()] += d.count;
    streak = d.count > 0 ? streak + 1 : 0;
    longestStreak = Math.max(longestStreak, streak);
  }

  const createdAt = new Date(profile.created_at);
  const years = Math.floor((Date.now() - createdAt.getTime()) / (365.25 * 24 * 3600 * 1000));
  const thisYear = today.slice(0, 4);
  const stats = {
    total: past.reduce((a, d) => a + d.count, 0),
    thisYearLabel: thisYear,
    thisYear: byYear.get(thisYear) ?? 0,
    activeDays: past.filter((d) => d.count > 0).length,
    longestStreak,
    bestDay: Math.max(...past.map((d) => d.count)),
    bestYear: Math.max(...byYear.values()),
    years,
    since: createdAt.getUTCFullYear(),
    byYear: [...byYear.entries()],
    byWeekday,
  };

  const trophies = TROPHIES.map((t) => {
    const value = stats[t.key];
    return { ...t, value, rank: t.steps.filter((s) => value >= s).length };
  });
  const overall = trophies.reduce((a, t) => a + t.rank, 0) / trophies.length;
  return { ...stats, trophies, overall };
}

const n = (v) => v.toLocaleString("en-US");

function panel(x, y, w, h, title, inner, t, delay) {
  const heading = title ? `<text x="20" y="31" class="title">${title}</text>` : "";
  return `<g transform="translate(${x} ${y})"><g class="in" style="animation-delay:${delay}ms">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${t.surface}" stroke="${t.border}"/>
${heading}${inner}</g></g>`;
}

function statTiles(s, t) {
  const tiles = [
    [n(s.total), "Total contributions"],
    [n(s.thisYear), `In ${s.thisYearLabel}`],
    [n(s.activeDays), "Active days"],
    [`${s.longestStreak} days`, "Longest streak"],
    [n(s.bestDay), "Best day"],
    [String(s.since), "On GitHub since"],
  ];
  const w = 132;
  const h = 64;
  return tiles
    .map(([value, label], i) => {
      const x = 20 + (i % 3) * (w + 8);
      const y = 48 + Math.floor(i / 3) * (h + 8);
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${t.tile}"/>` +
        `<text x="${x + 12}" y="${y + 29}" class="value">${value}</text>` +
        `<text x="${x + 12}" y="${y + 49}" class="label">${label}</text>`
      );
    })
    .join("");
}

function ring(s, t, cx, cy) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const share = s.overall / (RANKS.length - 1);
  const rank = RANKS[Math.round(s.overall)];
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="8"/>` +
    `<circle class="ring" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.accent}" stroke-width="8" stroke-linecap="round" ` +
    `stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - share)).toFixed(1)}" ` +
    `style="--from:${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>` +
    `<text x="${cx}" y="${cy + 13}" text-anchor="middle" class="grade">${rank.name}</text>` +
    `<text x="${cx}" y="${cy + 76}" text-anchor="middle" class="label">Overall rank</text>`
  );
}

function bars(items, x0, baseY, plotH, plotW, t, { labelAll }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const step = plotW / items.length;
  const barW = Math.min(step - 10, 34);
  return items
    .map((item, i) => {
      const h = Math.max((item.value / max) * plotH, 3);
      const x = x0 + i * step + (step - barW) / 2;
      const y = baseY - h;
      const r = Math.min(4, h / 2);
      const cx = x + barW / 2;
      const d =
        `M${x} ${baseY}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + barW - r}` +
        `Q${x + barW} ${y} ${x + barW} ${y + r}V${baseY}Z`;
      const showValue = labelAll || item.value === max;
      return (
        `<path class="bar" style="animation-delay:${300 + i * 60}ms" d="${d}" fill="${t.accent}"/>` +
        (showValue ? `<text x="${cx}" y="${y - 7}" text-anchor="middle" class="num">${n(item.value)}</text>` : "") +
        `<text x="${cx}" y="${baseY + 18}" text-anchor="middle" class="axis">${item.label}</text>`
      );
    })
    .join("");
}

function trophy(tr, t, x, w, i) {
  const rank = RANKS[tr.rank];
  const cx = x + w / 2;
  const cup =
    `<g transform="translate(${cx - 19} 54)" fill="${rank.color}">` +
    `<path d="M7 0H31V13C31 21 26 26 19 26S7 21 7 13Z"/>` +
    `<path fill="none" stroke="${rank.color}" stroke-width="3" d="M7 4H2V8C2 13 5 16 9 16M31 4H36V8C36 13 33 16 29 16"/>` +
    `<rect x="17" y="26" width="4" height="7"/><rect x="10" y="33" width="18" height="4" rx="2"/></g>`;
  return (
    `<g class="pop" style="animation-delay:${450 + i * 70}ms;transform-origin:${cx}px 70px">` +
    `<rect x="${x}" y="48" width="${w}" height="140" rx="8" fill="${t.tile}"/>${cup}` +
    `<text x="${cx}" y="115" text-anchor="middle" class="rank" fill="${rank.color}">${rank.name}</text>` +
    `<text x="${cx}" y="139" text-anchor="middle" class="name">${tr.title}</text>` +
    `<text x="${cx}" y="158" text-anchor="middle" class="num">${n(tr.value)}</text>` +
    `<text x="${cx}" y="175" text-anchor="middle" class="axis">${tr.unit}</text></g>`
  );
}

function stack(t, w) {
  const cols = 4;
  const gap = 8;
  const pill = (w - 40 - gap * (cols - 1)) / cols;
  return STACK.map(([label, icon, color], i) => {
    const x = 20 + (i % cols) * (pill + gap);
    const y = 66 + Math.floor(i / cols) * 54;
    return (
      `<rect x="${x}" y="${y}" width="${pill}" height="46" rx="8" fill="${t.tile}"/>` +
      `<svg x="${x + 9}" y="${y + 16}" width="14" height="14" viewBox="0 0 24 24"><path fill="${color ?? t.ink}" d="${ICONS[icon]}"/></svg>` +
      `<text x="${x + 28}" y="${y + 27}" class="pill">${label}</text>`
    );
  }).join("");
}

function dashboard(s, t) {
  const half = (WIDTH - GAP) / 2;
  const statsW = 556;
  const yearsW = WIDTH - statsW - GAP;
  const row1 = 204;
  const row2 = 204;
  const row3 = 196;

  const statsPanel = panel(0, 0, statsW, row1, "GitHub Stats", statTiles(s, t) + ring(s, t, statsW - 66, 96), t, 0);

  const yearItems = s.byYear.map(([label, value]) => ({ label, value }));
  const yearsPanel = panel(
    statsW + GAP, 0, yearsW, row1, "Contributions by Year",
    bars(yearItems, 16, row1 - 34, 108, yearsW - 32, t, { labelAll: true }), t, 100,
  );

  const tw = (WIDTH - 40 - 8 * (s.trophies.length - 1)) / s.trophies.length;
  const trophyInner = s.trophies.map((tr, i) => trophy(tr, t, 20 + i * (tw + 8), tw, i)).join("");
  const trophyPanel = panel(0, row1 + GAP, WIDTH, row2, "Trophies", trophyInner, t, 200);

  const week = s.byWeekday.map((value, i) => ({ label: WEEKDAYS[i], value }));
  const y3 = row1 + row2 + GAP * 2;
  const weekPanel = panel(
    0, y3, half, row3, "Weekly Rhythm",
    bars(week, 16, row3 - 34, 92, half - 32, t, { labelAll: false }), t, 300,
  );
  const stackPanel = panel(half + GAP, y3, half, row3, "Tech Stack", stack(t, half), t, 400);

  const height = y3 + row3;
  const best = s.trophies.map((tr) => `${tr.title}: ${tr.value}`).join(", ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="t d">
<title id="t">GitHub stats of ${USER}</title>
<desc id="d">${n(s.total)} contributions since ${s.since}. ${best}.</desc>
<style>
text { font-family: ${FONT}; }
.title { font-size: 15px; font-weight: 600; fill: ${t.ink}; }
.value { font-size: 21px; font-weight: 600; letter-spacing: -0.01em; fill: ${t.ink}; }
.label { font-size: 12px; fill: ${t.secondary}; }
.axis { font-size: 12px; fill: ${t.muted}; }
.num { font-size: 13px; font-weight: 600; fill: ${t.secondary}; }
.name { font-size: 13px; font-weight: 600; fill: ${t.ink}; }
.pill { font-size: 12px; font-weight: 500; fill: ${t.secondary}; }
.grade { font-size: 38px; font-weight: 700; fill: ${t.ink}; }
.rank { font-size: 15px; font-weight: 700; }
.in { animation: in .6s ease-out both; }
.pop { animation: pop .5s cubic-bezier(.2,1.3,.5,1) both; }
.bar { transform-box: fill-box; transform-origin: bottom; animation: grow .7s ease-out both; }
.ring { animation: ring 1.2s ease-out .3s both; }
@keyframes in { from { opacity: 0; transform: translateY(6px); } }
@keyframes pop { from { opacity: 0; transform: scale(.85); } }
@keyframes grow { from { transform: scaleY(0); } }
@keyframes ring { from { stroke-dashoffset: var(--from); } }
@media (prefers-reduced-motion: reduce) { .in, .pop, .bar, .ring { animation: none; } }
</style>
${statsPanel}
${yearsPanel}
${trophyPanel}
${weekPanel}
${stackPanel}
</svg>
`;
}

function hero(name) {
  const h = 190;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${h}" viewBox="0 0 ${WIDTH} ${h}" role="img" aria-label="${name}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1a33"/><stop offset="1" stop-color="#111733"/></linearGradient>
<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
<clipPath id="clip"><rect width="${WIDTH}" height="${h}" rx="16"/></clipPath>
</defs>
<style>
text { font-family: ${FONT}; fill: #ffffff; }
.name { font-size: 60px; font-weight: 700; letter-spacing: -0.03em; }
.tag { font-size: 18px; fill: #c4d4f0; }
.a { animation: drift 14s ease-in-out infinite alternate; }
.b { animation: drift 18s ease-in-out infinite alternate-reverse; }
.up { animation: up .8s ease-out both; }
.up2 { animation: up .8s ease-out .15s both; }
@keyframes drift { from { transform: translate(-70px, -14px); } to { transform: translate(70px, 18px); } }
@keyframes up { from { opacity: 0; transform: translateY(10px); } }
@media (prefers-reduced-motion: reduce) { .a, .b, .up, .up2 { animation: none; } }
</style>
<g clip-path="url(#clip)">
<rect width="${WIDTH}" height="${h}" fill="url(#bg)"/>
<g filter="url(#blur)">
<circle class="a" cx="170" cy="60" r="110" fill="#2a78d6" opacity=".75"/>
<circle class="b" cx="710" cy="140" r="120" fill="#6250d6" opacity=".7"/>
<circle class="a" cx="470" cy="210" r="80" fill="#199e70" opacity=".4"/>
</g>
</g>
<text class="name up" x="${WIDTH / 2}" y="106" text-anchor="middle">${name}</text>
<text class="tag up2" x="${WIDTH / 2}" y="142" text-anchor="middle">${TAGLINE}</text>
</svg>
`;
}

function linkButton({ label, name, icon, color, w }) {
  const iconX = label ? 14 : (w - 16) / 2;
  const glyph = icon
    ? `<svg x="${iconX}" y="9" width="16" height="16" viewBox="0 0 24 24"><path fill="#ffffff" d="${ICONS[icon]}"/></svg>`
    : "";
  const text = label
    ? `<text x="${icon ? 38 : w / 2}" y="22" text-anchor="${icon ? "start" : "middle"}" font-family='${FONT}' font-size="14" font-weight="600" fill="#ffffff">${label}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34" viewBox="0 0 ${w} 34" role="img" aria-label="${name}">
<rect width="${w}" height="34" rx="8" fill="${color}"/>${glyph}${text}
</svg>
`;
}

const profile = await fetchProfile();
const days = [];
const firstYear = new Date(profile.created_at).getUTCFullYear();
for (let y = firstYear; y <= new Date().getUTCFullYear(); y++) days.push(...(await fetchYear(y)));
const stats = summarize(days, profile);

await mkdir(OUT_DIR, { recursive: true });
const out = (file, svg) => writeFile(new URL(file, OUT_DIR), svg);
await out("hero.svg", hero(profile.name ?? USER));
for (const link of LINKS) await out(`${link.file}.svg`, linkButton(link));
for (const [name, theme] of Object.entries(THEMES)) await out(`stats-${name}.svg`, dashboard(stats, theme));

console.log({ ...stats, trophies: stats.trophies.map((t) => `${t.title}=${t.value}:${RANKS[t.rank].name}`) });
