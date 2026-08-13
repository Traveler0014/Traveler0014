// 构建期生成器：抓公开 GitHub 数据 + 解密星空模块，渲染成一张「星空为底、统计叠上」的卡片。
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkyModule } from './sky-decrypt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const USERNAME = 'Traveler0014';

// ============================== 配置（env 可覆盖） ==============================

const envNum = (k, d) => {
  const v = process.env[k];
  if (v === undefined || v === '' || Number.isNaN(Number(v))) return d;
  return Number(v);
};

// 观测点（我）→ 目标（你）。默认值是占位（0,0），真实坐标走 Secrets 里的环境变量。
const OBSERVER = { lat: envNum('SKY_OBS_LAT', 0), lon: envNum('SKY_OBS_LON', 0) };
const TARGET = { lat: envNum('SKY_TGT_LAT', 0), lon: envNum('SKY_TGT_LON', 0) };
// 取景窗：±60° 方位、仰角 5–45°
const HALF_AZ = envNum('SKY_HALF_AZ', 60);
const ALT_MIN = envNum('SKY_ALT_MIN', 5);
const ALT_MAX = envNum('SKY_ALT_MAX', 45);
const MAX_STARS = envNum('SKY_MAX_STARS', 40);

// ============================== GitHub 数据 ==============================

async function gh(path) {
  const headers = { 'User-Agent': 'traveler0014-profile', Accept: 'application/vnd.github+json' };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchStats() {
  const [user, repos] = await Promise.all([
    gh(`/users/${USERNAME}`),
    gh(`/users/${USERNAME}/repos?per_page=100&sort=pushed`),
  ]);
  const langs = {};
  for (const r of repos) {
    if (r.fork) continue;
    if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
  }
  return {
    repos: user.public_repos,
    sinceYear: user.created_at ? Number(user.created_at.slice(0, 4)) : null,
    languages: Object.entries(langs).sort((a, b) => b[1] - a[1]),
  };
}

// 「过去一年 contributions」只有 GraphQL 能拿。CI 里有 GITHUB_TOKEN，本地无 token 则返回 null。
async function fetchContributions() {
  if (!process.env.GH_TOKEN) return null;
  const query = `query { user(login: "${USERNAME}") { contributionsCollection { contributionCalendar { totalContributions } } } }`;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'traveler0014-profile',
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const n = json?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions;
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}

// ============================== 卡片渲染 ==============================

const LANG_COLORS = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Go: '#00ADD8',
  Python: '#3572A5',
  Lua: '#000080',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  Java: '#b07219',
  Vue: '#41b883',
  Ruby: '#701516',
};
const langColor = (name) => LANG_COLORS[name] || '#8b949e';

function litPath(f, waxing, R) {
  const rx = +(R * Math.abs(1 - 2 * f)).toFixed(2);
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (f < 0.5 ? 0 : 1) : f < 0.5 ? 1 : 0;
  return `M0 ${-R} A${R} ${R} 0 0 ${limbSweep} 0 ${R} A${rx} ${R} 0 0 ${termSweep} 0 ${-R} Z`;
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

// 一句签名（右下角）。随时改词。
const TAGLINE = 'Explore me as you please — no warranty whatsoever.';

function renderCard(bodies, stats, contributions) {
  const W = 840;
  const H = 210;
  const R = 16;

  const p = [];
  p.push(`<defs>
    <linearGradient id="skybg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161f33"/>
      <stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(13,17,23,0.88)"/>
      <stop offset="0.5" stop-color="rgba(13,17,23,0.5)"/>
      <stop offset="1" stop-color="rgba(13,17,23,0)"/>
    </linearGradient>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="${R}"/></clipPath>
    <clipPath id="langclip"><rect x="40" y="150" width="340" height="5" rx="2.5"/></clipPath>
  </defs>`);

  p.push(`<g clip-path="url(#card)">`);
  p.push(`<rect width="${W}" height="${H}" fill="url(#skybg)"/>`);

  // —— 星空背景 ——
  for (const b of bodies) {
    const x = (b.x / 100) * W;
    const y = (b.y / 100) * H;
    if (b.kind === 'star') {
      p.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(b.size / 2).toFixed(2)}" fill="#fff" opacity="${+(b.opacity * 0.75).toFixed(2)}"/>`
      );
    } else if (b.kind === 'planet') {
      p.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(b.size / 2).toFixed(2)}" fill="#f0b27a" opacity="0.85"/>`
      );
    } else if (b.kind === 'sun') {
      p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(b.size / 2 + 4).toFixed(1)}" fill="#ffd166" opacity="0.2"/>`);
      p.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(b.size / 2).toFixed(1)}" fill="#ffd166"/>`);
    } else if (b.kind === 'moon') {
      const Rr = b.size / 2;
      p.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">`);
      p.push(`<circle r="${Rr}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>`);
      if (b.phase >= 0.985) p.push(`<circle r="${Rr}" fill="#f2efe6"/>`);
      else if (b.phase > 0.015) p.push(`<path d="${litPath(b.phase, b.waxing, Rr)}" fill="#f2efe6"/>`);
      p.push(`</g>`);
    }
  }

  // —— 左侧文字遮罩 ——
  p.push(`<rect width="${W}" height="${H}" fill="url(#scrim)"/>`);

  // —— 统计：repos + contributions（本地无 token 时回退为「since 年份」）——
  const statsItems = [
    ['REPOS', String(stats.repos)],
    contributions != null
      ? ['CONTRIBUTIONS', contributions.toLocaleString('en-US')]
      : ['SINCE', stats.sinceYear ? String(stats.sinceYear) : '—'],
  ];
  const cols = [40, 240];
  statsItems.forEach(([label, val], i) => {
    p.push(
      `<text x="${cols[i]}" y="86" font-family="${FONT}" font-size="34" font-weight="300" fill="#f0f6fc">${val}</text>`
    );
    p.push(
      `<text x="${cols[i]}" y="108" font-family="${FONT}" font-size="10" font-weight="500" letter-spacing="2.5" fill="#7d8590">${label}</text>`
    );
  });

  // —— 语言：标签 + 比例条 + 图例 ——
  p.push(
    `<text x="40" y="140" font-family="${FONT}" font-size="9" font-weight="500" letter-spacing="2.5" fill="#6e7781">LANGUAGES</text>`
  );
  p.push(`<rect x="40" y="150" width="340" height="5" rx="2.5" fill="#30363d"/>`);
  const top = stats.languages.slice(0, 6);
  const total = top.reduce((s, [, n]) => s + n, 0);
  let lx = 40;
  p.push(`<g clip-path="url(#langclip)">`);
  for (const [name, n] of top) {
    const w = (n / total) * 340;
    p.push(`<rect x="${lx.toFixed(1)}" y="150" width="${w.toFixed(1)}" height="5" fill="${langColor(name)}"/>`);
    lx += w;
  }
  p.push(`</g>`);

  // 图例：● 名称 数量
  let gx = 40;
  for (const [name, n] of top) {
    p.push(`<circle cx="${(gx + 4).toFixed(1)}" cy="182.5" r="3" fill="${langColor(name)}"/>`);
    p.push(
      `<text x="${(gx + 12).toFixed(1)}" y="186" font-family="${FONT}" font-size="9" fill="#c9d1d9">${name}<tspan fill="#6e7781"> ${n}</tspan></text>`
    );
    gx += 12 + (name.length + String(n).length + 1) * 5.1 + 16;
  }

  // —— 签名 ——
  p.push(
    `<text x="${W - 24}" y="${H - 18}" text-anchor="end" font-family="${FONT}" font-size="10" font-style="italic" fill="rgba(255,255,255,0.42)">${TAGLINE}</text>`
  );

  p.push(`</g>`);
  p.push(`<rect width="${W}" height="${H}" rx="${R}" fill="none" stroke="rgba(255,255,255,0.08)"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${p.join('')}</svg>`;
}

// ============================== 主流程 ==============================

const now = new Date();
const stats = await fetchStats();
const contributions = await fetchContributions();

const passphrase = process.env.SKY_PASSPHRASE;
if (!passphrase) throw new Error('缺少环境变量 SKY_PASSPHRASE（星空解密口令）');

const sky = await loadSkyModule(passphrase);
const bodies = sky.computeSky(now, {
  observer: OBSERVER,
  target: TARGET,
  halfAz: HALF_AZ,
  altMin: ALT_MIN,
  altMax: ALT_MAX,
  maxStars: MAX_STARS,
});

writeFileSync(join(ROOT, 'card.svg'), renderCard(bodies, stats, contributions));

console.log('已生成 card.svg');
console.log(`repos: ${stats.repos} · contributions(1y): ${contributions ?? '不可用，回退 since'} · since: ${stats.sinceYear}`);
console.log(
  `langs: ${stats.languages.slice(0, 6).map(([l, n]) => `${l}:${n}`).join(', ')}`
);
console.log(`sky: ${bodies.length} 个天体（observer=${OBSERVER.lat},${OBSERVER.lon} → target=${TARGET.lat},${TARGET.lon}）`);
