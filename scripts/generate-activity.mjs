// プロフィール README の Activity カードを生成する。
// 公開情報だけを読み、assets/activity-dark.svg と activity-light.svg を書き出す。
// 取得に失敗したらエラーで止まるので、前回の画像がそのまま残る。

import { mkdir, writeFile } from "node:fs/promises";

const USER = "yoshiki0405";
const OUT_DIR = new URL("../assets/", import.meta.url);

const CELL = 12;
const GAP = 3;
const PAD = 28;
const WEEKDAY_W = 34;
const WEEKS = 53;
const WIDTH = PAD * 2 + WEEKDAY_W + WEEKS * (CELL + GAP) - GAP;

const THEMES = {
  dark: {
    surface: "#0d1117",
    border: "#30363d",
    ink: "#f0f6fc",
    secondary: "#c9d1d9",
    muted: "#8b949e",
    levels: ["#21262d", "#184f95", "#2a78d6", "#5598e7", "#9ec5f4"],
    languages: { TypeScript: "#3987e5", CSS: "#d95926", JavaScript: "#199e70", HTML: "#c98500", Other: "#6e7681" },
  },
  light: {
    surface: "#ffffff",
    border: "#d0d7de",
    ink: "#1f2328",
    secondary: "#59636e",
    muted: "#59636e",
    levels: ["#eff2f5", "#b7d3f6", "#6da7ec", "#2a78d6", "#184f95"],
    languages: { TypeScript: "#2a78d6", CSS: "#eb6834", JavaScript: "#1baf7a", HTML: "#eda100", Other: "#8c959f" },
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function fetchContributions() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, {
    headers: { "User-Agent": `${USER}-profile-card` },
  });
  if (!res.ok) throw new Error(`contributions: HTTP ${res.status}`);
  const html = await res.text();

  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>\s*(\d+|No) contributions? on/g)) {
    counts.set(m[1], m[2] === "No" ? 0 : Number(m[2]));
  }

  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*>/g)) {
    const date = m[0].match(/data-date="(\d{4}-\d{2}-\d{2})"/)?.[1];
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    const level = m[0].match(/data-level="(\d)"/)?.[1];
    if (!date || !id || level === undefined) continue;
    if (!counts.has(id)) throw new Error(`contributions: ${date} の件数が読めない`);
    days.push({ date, level: Number(level), count: counts.get(id) });
  }
  if (days.length < 300) throw new Error(`contributions: ${days.length} 日分しか読めない`);
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchLanguages() {
  const headers = { "User-Agent": `${USER}-profile-card`, Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const get = async (url) => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  };

  const repos = await get(`https://api.github.com/users/${USER}/repos?per_page=100`);
  const totals = {};
  for (const repo of repos) {
    if (repo.fork) continue;
    for (const [name, bytes] of Object.entries(await get(repo.languages_url))) {
      totals[name] = (totals[name] ?? 0) + bytes;
    }
  }

  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (sum === 0) throw new Error("languages: データなし");

  // 配色のある言語だけ個別に出し、残りは Other にまとめる
  const known = Object.keys(THEMES.dark.languages).filter((n) => n !== "Other");
  const items = known.filter((n) => totals[n]).map((name) => ({ name, bytes: totals[name] }));
  const otherBytes = sum - items.reduce((a, i) => a + i.bytes, 0);
  items.sort((a, b) => b.bytes - a.bytes);
  if (otherBytes > 0) items.push({ name: "Other", bytes: otherBytes });
  return items.map((i) => ({ ...i, share: i.bytes / sum }));
}

function summarize(days) {
  const months = new Map();
  for (const d of days) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + d.count);
  const [busiest] = [...months.entries()].sort((a, b) => b[1] - a[1]);
  const [year, month] = busiest[0].split("-");
  return {
    total: days.reduce((a, d) => a + d.count, 0),
    activeDays: days.filter((d) => d.count > 0).length,
    busiest: `${MONTHS[Number(month) - 1]} ${year}`,
    busiestCount: busiest[1],
  };
}

function renderHeatmap(days, t, top) {
  const left = PAD + WEEKDAY_W;
  const firstDow = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const parts = [];
  const monthLabels = [];
  let lastMonth = null;

  days.forEach((d, i) => {
    const slot = i + firstDow;
    const week = Math.floor(slot / 7);
    const dow = slot % 7;
    const x = left + week * (CELL + GAP);
    const y = top + 20 + dow * (CELL + GAP);
    parts.push(
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${t.levels[d.level]}"/>`,
    );

    const month = Number(d.date.slice(5, 7));
    if (month !== lastMonth && dow === 0) {
      monthLabels.push({ x, name: MONTHS[month - 1] });
      lastMonth = month;
    }
  });

  // 左端の月は週が少ないと次の月と重なるので、そのときは出さない
  if (monthLabels.length > 1 && monthLabels[1].x - monthLabels[0].x < 36) monthLabels.shift();
  for (const { x, name } of monthLabels) {
    parts.push(`<text x="${x}" y="${top + 9}" class="axis">${name}</text>`);
  }

  for (const [dow, label] of [[1, "Mon"], [3, "Wed"], [5, "Fri"]]) {
    const y = top + 20 + dow * (CELL + GAP) + CELL - 2;
    parts.push(`<text x="${PAD}" y="${y}" class="axis">${label}</text>`);
  }
  return parts.join("");
}

function renderLegend(t, right, y) {
  const swatches = t.levels
    .map((c, i) => `<rect x="${right - 110 + i * (CELL + GAP)}" y="${y - 10}" width="${CELL}" height="${CELL}" rx="3" fill="${c}"/>`)
    .join("");
  return (
    `<text x="${right - 118}" y="${y}" class="axis" text-anchor="end">Less</text>` +
    swatches +
    `<text x="${right}" y="${y}" class="axis" text-anchor="end">More</text>`
  );
}

function renderLanguages(languages, t, top) {
  const barW = WIDTH - PAD * 2;
  const space = 2;
  const usable = barW - space * (languages.length - 1);
  let x = PAD;
  let bar = "";
  for (const l of languages) {
    const w = Math.max(usable * l.share, 3);
    bar += `<rect x="${x.toFixed(1)}" y="${top + 16}" width="${w.toFixed(1)}" height="8" rx="4" fill="${t.languages[l.name]}"/>`;
    x += w + space;
  }

  const legend = languages
    .map((l, i) => {
      const lx = PAD + i * 170;
      const pct = `${(l.share * 100).toFixed(l.share < 0.1 ? 1 : 0)}%`;
      return (
        `<circle cx="${lx + 5}" cy="${top + 45}" r="5" fill="${t.languages[l.name]}"/>` +
        `<text x="${lx + 16}" y="${top + 50}" class="body">${l.name} <tspan class="axis">${pct}</tspan></text>`
      );
    })
    .join("");

  return `<text x="${PAD}" y="${top + 4}" class="axis">Languages in public repos</text>${bar}${legend}`;
}

function renderCard(days, languages, stats, t) {
  const statsTop = PAD;
  const heatTop = statsTop + 80;
  const heatBottom = heatTop + 20 + 7 * (CELL + GAP) - GAP;
  const legendY = heatBottom + 24;
  const langTop = legendY + 26;
  const height = langTop + 50 + PAD;

  const tiles = [
    [stats.total.toLocaleString("en-US"), "contributions in the last year"],
    [String(stats.activeDays), "active days"],
    [stats.busiest, `busiest month · ${stats.busiestCount} contributions`],
  ];
  const tileXs = [PAD, PAD + 300, PAD + 500];
  const tileSvg = tiles
    .map(
      ([value, label], i) =>
        `<text x="${tileXs[i]}" y="${statsTop + 30}" class="value">${value}</text>` +
        `<text x="${tileXs[i]}" y="${statsTop + 52}" class="label">${label}</text>`,
    )
    .join("");

  const summary = `${stats.total} contributions on ${stats.activeDays} active days in the last year`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="t d">
<title id="t">GitHub activity of ${USER}</title>
<desc id="d">${summary}. Busiest month: ${stats.busiest}.</desc>
<style>
text { font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
.value { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; fill: ${t.ink}; }
.label { font-size: 13px; fill: ${t.secondary}; }
.axis { font-size: 12px; fill: ${t.muted}; }
.body { font-size: 13px; fill: ${t.secondary}; }
</style>
<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="12" fill="${t.surface}" stroke="${t.border}"/>
${tileSvg}
${renderHeatmap(days, t, heatTop)}
${renderLegend(t, WIDTH - PAD, legendY)}
${renderLanguages(languages, t, langTop)}
</svg>
`;
}

const [days, languages] = await Promise.all([fetchContributions(), fetchLanguages()]);
const stats = summarize(days);

await mkdir(OUT_DIR, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  await writeFile(new URL(`activity-${name}.svg`, OUT_DIR), renderCard(days, languages, stats, theme));
}
console.log(`${days.length} days, ${stats.total} contributions, ${stats.activeDays} active days, busiest ${stats.busiest}`);
console.log(languages.map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`).join(", "));
