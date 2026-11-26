import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, "..");
const THEMES_DIR = path.join(ROOT, "themes");
const TRYON_DIR = path.join(ROOT, "tryon");
const SITE_DIR = path.join(ROOT, "site");
const DIST_DIR = path.join(ROOT, "dist");
const CACHE_DIR = path.join(ROOT, ".cache", "webp");

interface ThemeColors {
  mode: string;
  background: string;
  dark_background: string;
  darker_background: string;
  lighter_background: string;
  selection: string;
  foreground: string;
  light_foreground: string;
  bright_foreground: string;
  dark_foreground: string;
  muted: string;
  accent: string;
  red: string;
  yellow: string;
  orange: string;
  green: string;
  cyan: string;
  blue: string;
  magenta: string;
  brown: string;
  bright_red: string;
  bright_yellow: string;
  bright_green: string;
  bright_cyan: string;
  bright_blue: string;
  bright_magenta: string;
}

interface ParsedBorder {
  raw: string;
  css: string;
  colors: string[];
  isGradient: boolean;
}

interface WallpaperEntry {
  filename: string;
  label: string;
  src: string;
}

interface RepoFileEntry {
  name: string;
  size: string;
  isDir: boolean;
  date: string;
}

interface ThemeRecord {
  slug: string;
  name: string;
  shortName: string;
  tagline: string;
  iconsTheme: string;
  colors: ThemeColors;
  activeBorder: ParsedBorder;
  inactiveBorder: ParsedBorder;
  contrast: {
    foreground: number;
    accent: number;
    muted: number;
  };
  wallpapers: WallpaperEntry[];
  thumb: string;
  files: RepoFileEntry[];
  tomlExcerpt: string[];
}

const REQUIRED_COLOR_KEYS: readonly (keyof ThemeColors)[] = [
  "mode",
  "background",
  "dark_background",
  "darker_background",
  "lighter_background",
  "selection",
  "foreground",
  "light_foreground",
  "bright_foreground",
  "dark_foreground",
  "muted",
  "accent",
  "red",
  "yellow",
  "orange",
  "green",
  "cyan",
  "blue",
  "magenta",
  "brown",
  "bright_red",
  "bright_yellow",
  "bright_green",
  "bright_cyan",
  "bright_blue",
  "bright_magenta",
];

function stripInlineComment(line: string): string {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") {
      inQuotes = !inQuotes;
    } else if (ch === "#" && !inQuotes) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseColorsToml(raw: string, slug: string): {
  kv: Record<string, string>;
  comments: string[];
} {
  const kv: Record<string, string> = {};
  const comments: string[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      comments.push(trimmed.replace(/^#\s?/, ""));
      continue;
    }
    const clean = stripInlineComment(line).trim();
    if (!clean) continue;
    const eq = clean.indexOf("=");
    if (eq === -1) continue;
    const key = clean.slice(0, eq).trim();
    let val = clean.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    kv[key] = val;
  }

  for (const key of REQUIRED_COLOR_KEYS) {
    if (!kv[key]) {
      throw new Error(`themes/${slug}/colors.toml is missing required key "${key}"`);
    }
  }

  return { kv, comments };
}

function parseHyprColorToken(token: string): string | null {
  const rgbaHex = /^rgba\(([0-9a-fA-F]{8})\)$/.exec(token);
  if (rgbaHex && rgbaHex[1]) {
    const hex = rgbaHex[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = +(parseInt(hex.slice(6, 8), 16) / 255).toFixed(3);
    return a >= 0.999 ? `#${hex.slice(0, 6).toLowerCase()}` : `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgbHex = /^rgb\(([0-9a-fA-F]{6})\)$/.exec(token);
  if (rgbHex && rgbHex[1]) {
    return `#${rgbHex[1].toLowerCase()}`;
  }
  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(token)) {
    return token.toLowerCase();
  }
  return null;
}

function hyprAngleToCss(angleDeg: number | null): number {
  // Hyprland measures angles counterclockwise from +X (0deg = right, 45deg = up-right, 135deg = up-left).
  // CSS linear-gradient measures clockwise from +Y (0deg = up, 45deg = up-right, 90deg = right, 315deg = up-left).
  const hypr = angleDeg ?? 45;
  return (((90 - hypr) % 360) + 360) % 360;
}

function parseHyprlandBorder(rawValue: string | undefined, fallbackColor: string): ParsedBorder {
  if (!rawValue || !rawValue.trim()) {
    return {
      raw: fallbackColor,
      css: fallbackColor,
      colors: [fallbackColor],
      isGradient: false,
    };
  }

  const tokens = rawValue.trim().split(/\s+/);
  const colors: string[] = [];
  let angleDeg: number | null = null;

  for (const tok of tokens) {
    const degMatch = /^(-?\d+(?:\.\d+)?)deg$/.exec(tok);
    if (degMatch && degMatch[1]) {
      angleDeg = Number(degMatch[1]);
      continue;
    }
    const parsed = parseHyprColorToken(tok);
    if (parsed) colors.push(parsed);
  }

  if (colors.length === 0) {
    return {
      raw: rawValue,
      css: fallbackColor,
      colors: [fallbackColor],
      isGradient: false,
    };
  }

  if (colors.length === 1) {
    const single = colors[0] ?? fallbackColor;
    return {
      raw: rawValue,
      css: single,
      colors,
      isGradient: false,
    };
  }

  const cssAngle = hyprAngleToCss(angleDeg);
  return {
    raw: rawValue,
    css: `linear-gradient(${cssAngle}deg, ${colors.join(", ")})`,
    colors,
    isGradient: true,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 10) / 10;
}

function parseReadmeDescriptions(): Record<string, string> {
  const readmePath = path.join(ROOT, "README.md");
  if (!fs.existsSync(readmePath)) return {};
  const text = fs.readFileSync(readmePath, "utf8");
  const map: Record<string, string> = {};
  const regex = /!\[([^\]]+)\]\(gallery\/([a-z0-9._-]+)\.(?:jpg|png|webp)\)\s+\*\*[^*]+\*\*:\s*([^|\n]+)/gi;
  for (const match of text.matchAll(regex)) {
    const slug = match[2];
    const desc = match[3]?.trim();
    if (slug && desc) {
      map[slug] = desc.charAt(0).toUpperCase() + desc.slice(1);
    }
  }
  return map;
}

function deriveNames(slug: string, comments: string[]): { name: string; shortName: string } {
  const firstComment = comments[0] ?? "";
  const headingMatch = /^([^:]+):/.exec(firstComment);
  const titleFromSlug = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const name = headingMatch?.[1]?.trim() || titleFromSlug;
  const shortName = name.replace(/^Seb\s+/i, "").trim() || name;
  return { name, shortName };
}

function deriveTagline(slug: string, readmeMap: Record<string, string>, comments: string[]): string {
  const fromReadme = readmeMap[slug];
  if (fromReadme) return fromReadme;
  const descriptive = comments
    .slice(1)
    .filter(
      (c) =>
        !/^Contrast on background/i.test(c) &&
        !/^Generated from/i.test(c) &&
        !/^Support hues/i.test(c) &&
        !/^#[0-9a-f]{6}/i.test(c) &&
        !/^Surfaces$/i.test(c) &&
        !/^Text$/i.test(c) &&
        !/^Accent and ANSI/i.test(c) &&
        !/^Window borders/i.test(c)
    )
    .slice(0, 2)
    .join(" ")
    .trim();
  return descriptive || `Dark Omarchy theme (${slug}).`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}k`;
  return `${bytes}`;
}

function formatShortDate(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(date.getUTCDate()).padStart(2, " ");
  const mon = months[date.getUTCMonth()] ?? "Nov";
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${mon} ${hh}:${mm}`;
}

function getGitFileDate(absPath: string, fallback: Date): Date {
  try {
    const rel = path.relative(ROOT, absPath);
    const out = execFileSync("git", ["log", "-1", "--format=%ct", "--", rel], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const epoch = Number(out);
    if (Number.isFinite(epoch) && epoch > 0) {
      return new Date(epoch * 1000);
    }
  } catch {
    // fallback to filesystem mtime
  }
  return fallback;
}

function readThemeFiles(themeDir: string): RepoFileEntry[] {
  const entries = fs
    .readdirSync(themeDir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return entries.map((entry) => {
    const full = path.join(themeDir, entry.name);
    const stat = fs.statSync(full);
    const commitDate = getGitFileDate(full, stat.mtime);
    return {
      name: entry.isDirectory() ? `${entry.name}/` : entry.name,
      size: entry.isDirectory() ? "-" : formatBytes(stat.size),
      isDir: entry.isDirectory(),
      date: formatShortDate(commitDate),
    };
  });
}

function buildTomlExcerpt(raw: string): string[] {
  const keepKeys = new Set([
    "mode",
    "background",
    "lighter_background",
    "selection",
    "foreground",
    "muted",
    "accent",
    "red",
    "yellow",
    "green",
    "cyan",
    "blue",
    "magenta",
    "hyprland_active_border",
    "hyprland_inactive_border",
  ]);
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("# Surfaces")) {
      out.push("# Surfaces");
      continue;
    }
    if (t.startsWith("# Text")) {
      out.push("# Text");
      continue;
    }
    if (t.startsWith("# Accent")) {
      out.push("# Accent & ANSI");
      continue;
    }
    if (t.startsWith("# Window")) {
      out.push("# Window borders");
      continue;
    }
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (keepKeys.has(key)) {
      out.push(stripInlineComment(t).trim());
    }
  }
  return out;
}

let imageMagickBin: string | null = null;

async function resolveImageMagick(): Promise<string> {
  if (imageMagickBin) return imageMagickBin;
  for (const bin of ["magick", "convert"]) {
    try {
      await execFileAsync(bin, ["-version"]);
      imageMagickBin = bin;
      return bin;
    } catch {
      // try next binary
    }
  }
  throw new Error("ImageMagick (magick or convert) is required to build WebP wallpapers");
}

async function ensureWebp(
  srcPath: string,
  destPath: string,
  width: number,
  height: number,
  quality: number
): Promise<void> {
  const srcStat = fs.statSync(srcPath);
  if (fs.existsSync(destPath)) {
    const destStat = fs.statSync(destPath);
    if (destStat.mtimeMs >= srcStat.mtimeMs && destStat.size > 0) {
      return;
    }
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const bin = await resolveImageMagick();
  await execFileAsync(bin, [
    srcPath,
    "-resize",
    `${width}x${height}^`,
    "-gravity",
    "center",
    "-extent",
    `${width}x${height}`,
    "-strip",
    "-quality",
    String(quality),
    destPath,
  ]);
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      if (current !== undefined) {
        await worker(current);
      }
    }
  });
  await Promise.all(runners);
}

function escapeJsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildInitialThemeCssVars(theme: ThemeRecord): string {
  const c = theme.colors;
  const pairs: ReadonlyArray<[string, string]> = [
    ["--t-bg", c.background],
    ["--t-bg-dark", c.dark_background],
    ["--t-bg-darker", c.darker_background],
    ["--t-bg-light", c.lighter_background],
    ["--t-selection", c.selection],
    ["--t-fg", c.foreground],
    ["--t-fg-light", c.light_foreground],
    ["--t-fg-bright", c.bright_foreground],
    ["--t-fg-dark", c.dark_foreground],
    ["--t-muted", c.muted],
    ["--t-accent", c.accent],
    ["--t-red", c.red],
    ["--t-yellow", c.yellow],
    ["--t-orange", c.orange],
    ["--t-green", c.green],
    ["--t-cyan", c.cyan],
    ["--t-blue", c.blue],
    ["--t-magenta", c.magenta],
    ["--t-brown", c.brown],
    ["--t-bright-red", c.bright_red],
    ["--t-bright-yellow", c.bright_yellow],
    ["--t-bright-green", c.bright_green],
    ["--t-bright-cyan", c.bright_cyan],
    ["--t-bright-blue", c.bright_blue],
    ["--t-bright-magenta", c.bright_magenta],
    ["--t-active-border", theme.activeBorder.css],
    ["--t-inactive-border", theme.inactiveBorder.css],
  ];
  return pairs.map(([k, v]) => `  ${k}: ${v};`).join("\n");
}

function buildFaviconDataUri(theme: ThemeRecord): string {
  const bg = encodeURIComponent(theme.colors.background);
  const accent = encodeURIComponent(theme.colors.accent);
  const second = encodeURIComponent(theme.activeBorder.colors[1] ?? theme.colors.cyan);
  return (
    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E` +
    `%3Crect width='32' height='32' fill='${bg}'/%3E` +
    `%3Crect x='5' y='5' width='22' height='22' fill='none' stroke='${accent}' stroke-width='2.5'/%3E` +
    `%3Crect x='11' y='11' width='10' height='10' fill='${second}'/%3E%3C/svg%3E`
  );
}

function compileClientTs(): string {
  const appTsPath = path.join(TRYON_DIR, "app.ts");
  const source = fs.readFileSync(appTsPath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      strict: true,
    },
    fileName: appTsPath,
  });
  return result.outputText;
}

function assembleHtml(
  template: string,
  rawCss: string,
  js: string,
  themes: ThemeRecord[],
  buildInfo: { count: number; mode: "site" | "bundle" }
): string {
  const first = themes[0]!;
  const css = rawCss.replace("/*__INITIAL_THEME_VARS__*/", () => buildInitialThemeCssVars(first));
  const payload = escapeJsonForScript({ themes, buildInfo });
  const countStr = String(themes.length);
  const counterStr = `01 / ${String(themes.length).padStart(2, "0")}`;

  return template
    .replace("/*__INITIAL_FAVICON__*/", () => escapeHtmlAttr(buildFaviconDataUri(first)))
    .replace("/*__STYLES__*/", () => css)
    .replaceAll("__THEME_COUNT__", countStr)
    .replaceAll("__INITIAL_COUNTER__", counterStr)
    .replaceAll("__INITIAL_NAME__", escapeHtmlAttr(first.name))
    .replaceAll("__INITIAL_SLUG__", escapeHtmlAttr(first.slug))
    .replace("/*__DATA__*/", () => `window.__SEBTHEMES_DATA__ = ${payload};`)
    .replace("/*__SCRIPT__*/", () => js);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const wantBundle = args.has("--bundle") || args.has("--all");

  const readmeMap = parseReadmeDescriptions();
  const themeDirs = fs
    .readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(THEMES_DIR, d.name, "colors.toml")))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  if (themeDirs.length === 0) {
    throw new Error("No themes with colors.toml found under themes/");
  }

  interface ImageTask {
    src: string;
    cachePath: string;
    sitePath: string | null;
    w: number;
    h: number;
    q: number;
  }

  const imageTasks: ImageTask[] = [];
  const siteThemes: ThemeRecord[] = [];
  const bundleImageSources = new Map<string, string>(); // siteRel -> cachePath (compact WebP for single-file bundle)

  for (const slug of themeDirs) {
    const themeDir = path.join(THEMES_DIR, slug);
    const tomlPath = path.join(themeDir, "colors.toml");
    const rawToml = fs.readFileSync(tomlPath, "utf8");
    const { kv, comments } = parseColorsToml(rawToml, slug);

    const colors: ThemeColors = {
      mode: kv.mode!,
      background: kv.background!,
      dark_background: kv.dark_background!,
      darker_background: kv.darker_background!,
      lighter_background: kv.lighter_background!,
      selection: kv.selection!,
      foreground: kv.foreground!,
      light_foreground: kv.light_foreground!,
      bright_foreground: kv.bright_foreground!,
      dark_foreground: kv.dark_foreground!,
      muted: kv.muted!,
      accent: kv.accent!,
      red: kv.red!,
      yellow: kv.yellow!,
      orange: kv.orange!,
      green: kv.green!,
      cyan: kv.cyan!,
      blue: kv.blue!,
      magenta: kv.magenta!,
      brown: kv.brown!,
      bright_red: kv.bright_red!,
      bright_yellow: kv.bright_yellow!,
      bright_green: kv.bright_green!,
      bright_cyan: kv.bright_cyan!,
      bright_blue: kv.bright_blue!,
      bright_magenta: kv.bright_magenta!,
    };

    const activeBorder = parseHyprlandBorder(kv.hyprland_active_border, colors.accent);
    const inactiveBorder = parseHyprlandBorder(kv.hyprland_inactive_border, colors.lighter_background);
    const { name, shortName } = deriveNames(slug, comments);
    const tagline = deriveTagline(slug, readmeMap, comments);

    const iconsPath = path.join(themeDir, "icons.theme");
    const iconsTheme = fs.existsSync(iconsPath) ? fs.readFileSync(iconsPath, "utf8").trim() : "default";

    const bgDir = path.join(themeDir, "backgrounds");
    const bgFiles = fs.existsSync(bgDir)
      ? fs
          .readdirSync(bgDir)
          .filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [];

    if (bgFiles.length === 0) {
      throw new Error(`themes/${slug}/backgrounds/ has no wallpaper images`);
    }

    const wallpapers: WallpaperEntry[] = bgFiles.map((filename, index) => {
      const stem = filename.replace(/\.[^.]+$/, "");
      const siteRel = `wallpapers/${slug}/${stem}.webp`;
      const cacheFull = path.join(CACHE_DIR, "wallpapers-2560", slug, `${stem}.webp`);
      const sitePath = path.join(SITE_DIR, siteRel);
      imageTasks.push({
        src: path.join(bgDir, filename),
        cachePath: cacheFull,
        sitePath,
        w: 2560,
        h: 1440,
        q: 84,
      });

      if (wantBundle) {
        const cacheCompact = path.join(CACHE_DIR, "wallpapers-1440", slug, `${stem}.webp`);
        imageTasks.push({
          src: path.join(bgDir, filename),
          cachePath: cacheCompact,
          sitePath: null,
          w: 1440,
          h: 810,
          q: 82,
        });
        bundleImageSources.set(siteRel, cacheCompact);
      }

      return {
        filename,
        label: String(index + 1),
        src: siteRel,
      };
    });

    const firstBg = bgFiles[0]!;
    const thumbRel = `thumbs/${slug}.webp`;
    const thumbCache = path.join(CACHE_DIR, "thumbs", `${slug}.webp`);
    const thumbSite = path.join(SITE_DIR, thumbRel);
    imageTasks.push({
      src: path.join(bgDir, firstBg),
      cachePath: thumbCache,
      sitePath: thumbSite,
      w: 360,
      h: 202,
      q: 78,
    });
    bundleImageSources.set(thumbRel, thumbCache);

    siteThemes.push({
      slug,
      name,
      shortName,
      tagline,
      iconsTheme,
      colors,
      activeBorder,
      inactiveBorder,
      contrast: {
        foreground: contrastRatio(colors.foreground, colors.background),
        accent: contrastRatio(colors.accent, colors.background),
        muted: contrastRatio(colors.muted, colors.background),
      },
      wallpapers,
      thumb: thumbRel,
      files: readThemeFiles(themeDir),
      tomlExcerpt: buildTomlExcerpt(rawToml),
    });
  }

  await runPool(imageTasks, 6, async (task) => {
    await ensureWebp(task.src, task.cachePath, task.w, task.h, task.q);
    if (task.sitePath) {
      fs.mkdirSync(path.dirname(task.sitePath), { recursive: true });
      fs.copyFileSync(task.cachePath, task.sitePath);
    }
  });

  const template = fs.readFileSync(path.join(TRYON_DIR, "template.html"), "utf8");
  const css = fs.readFileSync(path.join(TRYON_DIR, "styles.css"), "utf8");
  const js = compileClientTs();

  fs.mkdirSync(SITE_DIR, { recursive: true });
  const siteHtml = assembleHtml(template, css, js, siteThemes, {
    count: siteThemes.length,
    mode: "site",
  });
  fs.writeFileSync(path.join(SITE_DIR, "index.html"), siteHtml, "utf8");
  fs.writeFileSync(path.join(SITE_DIR, "themes.json"), JSON.stringify(siteThemes, null, 2), "utf8");

  console.log(`Built site/ (${siteThemes.length} themes, ${siteThemes.reduce((n, t) => n + t.wallpapers.length, 0)} 2560px WebP wallpapers)`);

  if (wantBundle) {
    const toDataUri = (rel: string): string => {
      const cachePath = bundleImageSources.get(rel);
      if (!cachePath) throw new Error(`Missing cached asset for ${rel}`);
      const buf = fs.readFileSync(cachePath);
      return `data:image/webp;base64,${buf.toString("base64")}`;
    };

    const bundledThemes: ThemeRecord[] = siteThemes.map((t) => ({
      ...t,
      thumb: toDataUri(t.thumb),
      wallpapers: t.wallpapers.map((w) => ({
        ...w,
        src: toDataUri(w.src),
      })),
    }));

    fs.mkdirSync(DIST_DIR, { recursive: true });
    const bundleHtml = assembleHtml(template, css, js, bundledThemes, {
      count: bundledThemes.length,
      mode: "bundle",
    });
    const outPath = path.join(DIST_DIR, "sebthemes-tryon.html");
    fs.writeFileSync(outPath, bundleHtml, "utf8");
    const sizeMb = (Buffer.byteLength(bundleHtml, "utf8") / (1024 * 1024)).toFixed(2);
    console.log(`Built self-contained ${path.relative(ROOT, outPath)} (${sizeMb} MB)`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
