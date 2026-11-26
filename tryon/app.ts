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

interface SebthemesBootstrap {
  themes: ThemeRecord[];
  buildInfo: {
    count: number;
    mode: "site" | "bundle";
  };
}

interface Window {
  __SEBTHEMES_DATA__?: SebthemesBootstrap;
}

type InstallMode = "single" | "all" | "clone";
type FocusedWindow = "terminal" | "editor" | "btop";

(() => {
  const bootstrap = window.__SEBTHEMES_DATA__;
  if (!bootstrap || bootstrap.themes.length === 0) return;

  const themes = bootstrap.themes;
  const INSTALL_URL = "https://raw.githubusercontent.com/ikkeseb/sebthemes/main/install.sh";
  const REPO_URL = "https://github.com/ikkeseb/sebthemes";
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const SWATCH_SPEC: ReadonlyArray<{ key: keyof ThemeColors; label: string; isAccent?: boolean }> = [
    { key: "darker_background", label: "darker" },
    { key: "background", label: "bg" },
    { key: "lighter_background", label: "surface" },
    { key: "selection", label: "selection" },
    { key: "muted", label: "muted" },
    { key: "foreground", label: "fg" },
    { key: "accent", label: "accent", isAccent: true },
    { key: "red", label: "red" },
    { key: "orange", label: "orange" },
    { key: "yellow", label: "yellow" },
    { key: "green", label: "green" },
    { key: "cyan", label: "cyan" },
    { key: "blue", label: "blue" },
    { key: "magenta", label: "magenta" },
  ];

  const CPU_BARS = [16, 22, 18, 28, 34, 26, 42, 54, 40, 29, 36, 48, 62, 46, 31, 27, 39, 52, 35, 24, 30, 26, 22, 24];

  const byId = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el as T;
  };

  const desktopFrame = byId<HTMLElement>("desktop-frame");
  const wpImgA = byId<HTMLImageElement>("wallpaper-a");
  const wpImgB = byId<HTMLImageElement>("wallpaper-b");
  const themeCounterEl = byId<HTMLElement>("theme-counter");
  const waybarClockEl = byId<HTMLElement>("waybar-clock");
  const waybarThemeEl = byId<HTMLElement>("waybar-theme");
  const termBodyEl = byId<HTMLElement>("term-body");
  const nvimCodeEl = byId<HTMLElement>("nvim-code");
  const nvimStatusEl = byId<HTMLElement>("nvim-statusline");
  const btopBodyEl = byId<HTMLElement>("btop-body");
  const menuListEl = byId<HTMLElement>("omarchy-menu-list");
  const menuCountEl = byId<HTMLElement>("menu-count");
  const wpBadgeFileEl = byId<HTMLElement>("wp-badge-file");
  const wpBadgeIndexEl = byId<HTMLElement>("wp-badge-index");
  const themeNameEl = byId<HTMLElement>("theme-name");
  const themeTaglineEl = byId<HTMLElement>("theme-tagline");
  const wpSwitcherEl = byId<HTMLElement>("wp-switcher");
  const paletteReadoutEl = byId<HTMLElement>("palette-readout");
  const paletteSwatchesEl = byId<HTMLElement>("palette-swatches");
  const themeRailEl = byId<HTMLElement>("theme-rail");
  const installCmdEl = byId<HTMLElement>("install-cmd");
  const mobileInstallCmdEl = byId<HTMLElement>("mobile-install-cmd");
  const copyInstallBtn = byId<HTMLButtonElement>("copy-install-btn");
  const copyInstallLabel = byId<HTMLElement>("copy-install-label");
  const mobileCopyBtn = byId<HTMLButtonElement>("mobile-copy-btn");
  const mobileCopyLabel = byId<HTMLElement>("mobile-copy-label");
  const prevThemeBtn = byId<HTMLButtonElement>("prev-theme-btn");
  const nextThemeBtn = byId<HTMLButtonElement>("next-theme-btn");
  const faviconEl = document.getElementById("dynamic-favicon") as HTMLLinkElement | null;

  let activeIndex = 0;
  let wallpaperIndex = 0;
  let installMode: InstallMode = "single";
  let activeWorkspace = 1;
  let focusedWindow: FocusedWindow = "terminal";
  let activeWpLayer: "a" | "b" = "a";
  let copyTimer: number | undefined;
  let swatchCopyTimer: number | undefined;
  const preloadedUrls = new Set<string>();
  const borderLayerState = new WeakMap<HTMLElement, { active: "a" | "b"; css: string }>();

  function prefersReducedMotion(): boolean {
    return reducedMotionQuery.matches;
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastOnBg(hex: string, bgHex: string): number {
    const l1 = luminance(hex);
    const l2 = luminance(bgHex);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 10) / 10;
  }

  function getInstallCommand(theme: ThemeRecord, mode: InstallMode): string {
    if (mode === "all") {
      return `curl -fsSL ${INSTALL_URL} | bash`;
    }
    if (mode === "clone") {
      return `git clone --depth 1 --single-branch -b ${theme.slug} ${REPO_URL} ~/.config/omarchy/themes/${theme.slug} && omarchy theme set ${theme.slug}`;
    }
    return `curl -fsSL ${INSTALL_URL} | bash -s ${theme.slug}`;
  }

  function renderInstallCommandHtml(theme: ThemeRecord, mode: InstallMode): string {
    if (mode === "all") {
      return `<span class="cmd-muted">curl -fsSL</span> ${INSTALL_URL} <span class="cmd-muted">|</span> <span class="cmd-accent">bash</span>`;
    }
    if (mode === "clone") {
      return `<span class="cmd-muted">git clone --depth 1 --single-branch -b</span> <span class="cmd-accent">${escapeHtml(theme.slug)}</span> ${REPO_URL} ~/.config/omarchy/themes/${escapeHtml(theme.slug)} <span class="cmd-muted">&amp;&amp;</span> omarchy theme set <span class="cmd-accent">${escapeHtml(theme.slug)}</span>`;
    }
    return `<span class="cmd-muted">curl -fsSL</span> ${INSTALL_URL} <span class="cmd-muted">| bash -s</span> <span class="cmd-accent">${escapeHtml(theme.slug)}</span>`;
  }

  function setWindowBorder(winEl: HTMLElement, cssBg: string, instant: boolean): void {
    const layerA = winEl.querySelector<HTMLElement>(".hypr-border-a");
    const layerB = winEl.querySelector<HTMLElement>(".hypr-border-b");
    if (!layerA || !layerB) return;

    const prev = borderLayerState.get(winEl);
    if (!prev || instant || prefersReducedMotion()) {
      layerA.style.background = cssBg;
      layerA.classList.add("is-visible");
      layerB.classList.remove("is-visible");
      borderLayerState.set(winEl, { active: "a", css: cssBg });
      return;
    }

    if (prev.css === cssBg) return;

    const nextActive = prev.active === "a" ? "b" : "a";
    const incoming = nextActive === "a" ? layerA : layerB;
    const outgoing = nextActive === "a" ? layerB : layerA;
    incoming.style.background = cssBg;
    incoming.classList.add("is-visible");
    outgoing.classList.remove("is-visible");
    borderLayerState.set(winEl, { active: nextActive, css: cssBg });
  }

  function syncAllWindowBorders(theme: ThemeRecord, instant: boolean): void {
    const isMobile = window.innerWidth <= 760;
    desktopFrame.querySelectorAll<HTMLElement>(".hypr-win[data-win]").forEach((winEl) => {
      const kind = winEl.dataset.win;
      const isFocused =
        kind === "menu" ||
        (isMobile && ((activeWorkspace === 1 && kind === "terminal") || (activeWorkspace === 2 && kind === "editor"))) ||
        kind === focusedWindow;
      winEl.classList.toggle("is-focused", isFocused);
      const borderCss = isFocused ? theme.activeBorder.css : theme.inactiveBorder.css;
      setWindowBorder(winEl, borderCss, instant);
    });
  }

  function applyThemeVars(theme: ThemeRecord): void {
    const root = document.documentElement.style;
    const c = theme.colors;
    root.setProperty("--theme-count", String(themes.length));
    root.setProperty("--t-bg", c.background);
    root.setProperty("--t-bg-dark", c.dark_background);
    root.setProperty("--t-bg-darker", c.darker_background);
    root.setProperty("--t-bg-light", c.lighter_background);
    root.setProperty("--t-selection", c.selection);
    root.setProperty("--t-fg", c.foreground);
    root.setProperty("--t-fg-light", c.light_foreground);
    root.setProperty("--t-fg-bright", c.bright_foreground);
    root.setProperty("--t-fg-dark", c.dark_foreground);
    root.setProperty("--t-muted", c.muted);
    root.setProperty("--t-accent", c.accent);
    root.setProperty("--t-red", c.red);
    root.setProperty("--t-yellow", c.yellow);
    root.setProperty("--t-orange", c.orange);
    root.setProperty("--t-green", c.green);
    root.setProperty("--t-cyan", c.cyan);
    root.setProperty("--t-blue", c.blue);
    root.setProperty("--t-magenta", c.magenta);
    root.setProperty("--t-brown", c.brown);
    root.setProperty("--t-bright-red", c.bright_red);
    root.setProperty("--t-bright-yellow", c.bright_yellow);
    root.setProperty("--t-bright-green", c.bright_green);
    root.setProperty("--t-bright-cyan", c.bright_cyan);
    root.setProperty("--t-bright-blue", c.bright_blue);
    root.setProperty("--t-bright-magenta", c.bright_magenta);
    root.setProperty("--t-active-border", theme.activeBorder.css);
    root.setProperty("--t-inactive-border", theme.inactiveBorder.css);

    if (faviconEl) {
      const bg = encodeURIComponent(c.background);
      const accent = encodeURIComponent(c.accent);
      const second = encodeURIComponent(theme.activeBorder.colors[1] ?? c.cyan);
      faviconEl.href =
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E` +
        `%3Crect width='32' height='32' fill='${bg}'/%3E` +
        `%3Crect x='5' y='5' width='22' height='22' fill='none' stroke='${accent}' stroke-width='2.5'/%3E` +
        `%3Crect x='11' y='11' width='10' height='10' fill='${second}'/%3E%3C/svg%3E`;
    }
  }

  function showWallpaper(src: string, instant: boolean): void {
    const incoming = activeWpLayer === "a" ? wpImgB : wpImgA;
    const outgoing = activeWpLayer === "a" ? wpImgA : wpImgB;

    if (instant || prefersReducedMotion() || !outgoing.getAttribute("src")) {
      outgoing.src = src;
      outgoing.classList.add("is-visible");
      incoming.classList.remove("is-visible");
      return;
    }

    if (outgoing.getAttribute("src") === src) return;

    const flip = (): void => {
      incoming.classList.add("is-visible");
      outgoing.classList.remove("is-visible");
      activeWpLayer = activeWpLayer === "a" ? "b" : "a";
    };

    incoming.onload = flip;
    incoming.src = src;
    if (incoming.complete && incoming.naturalWidth > 0) {
      incoming.onload = null;
      flip();
    }
  }

  function preloadNeighbors(idx: number): void {
    const indices = [
      (idx + 1) % themes.length,
      (idx - 1 + themes.length) % themes.length,
    ];
    for (const i of indices) {
      const t = themes[i];
      const wp = t?.wallpapers[0];
      if (wp && !preloadedUrls.has(wp.src)) {
        preloadedUrls.add(wp.src);
        const img = new Image();
        img.src = wp.src;
      }
    }
  }

  function renderTerminal(theme: ThemeRecord): void {
    const c = theme.colors;
    const wpCount = theme.wallpapers.length;
    const wpWord = wpCount === 1 ? "wallpaper" : "wallpapers";
    const fileRows = theme.files
      .map((f) => {
        const perm = f.isDir
          ? `<span class="p-d">d</span><span class="p-r">r</span><span class="p-w">w</span><span class="p-x">x</span><span class="p-r">r</span>-<span class="p-x">x</span><span class="p-r">r</span>-<span class="p-x">x</span>`
          : `.<span class="p-r">r</span><span class="p-w">w</span>-<span class="p-r">r</span>--<span class="p-r">r</span>--`;
        const nameCls = f.isDir
          ? "eza-name-dir"
          : f.name.endsWith(".toml")
            ? "eza-name-toml"
            : f.name.endsWith(".png")
              ? "eza-name-img"
              : "eza-name-txt";
        return (
          `<div class="eza-row">` +
          `<span class="eza-perm">${perm}</span>` +
          `<span class="eza-size">${escapeHtml(f.size)}</span>` +
          `<span class="eza-user">seb</span>` +
          `<span class="eza-date">${escapeHtml(f.date)}</span>` +
          `<span class="${nameCls}">${escapeHtml(f.name)}</span>` +
          `</div>`
        );
      })
      .join("");

    // Exact Omarchy Ghostty/Alacritty mapping: palette 0 = background, palette 8 = muted
    const ansiColors = [
      c.background, c.red, c.green, c.yellow, c.blue, c.magenta, c.cyan, c.foreground,
      c.muted, c.bright_red, c.bright_green, c.bright_yellow, c.bright_blue, c.bright_magenta, c.bright_cyan, c.bright_foreground,
    ];
    const ansiCells = ansiColors
      .map((hex) => `<span class="ansi-cell" style="background:${hex}"></span>`)
      .join("");

    const borderDesc = theme.activeBorder.isGradient
      ? `gradient (${theme.activeBorder.colors.length} stops)`
      : `solid ${theme.activeBorder.colors[0] ?? c.accent}`;

    termBodyEl.innerHTML = `
      <div class="term-block">
        <div class="term-prompt-line">
          <span class="t-dir">~/sebthemes</span>
          <span class="t-branch">main</span>
          <span class="t-chevron">❯</span>
          <span class="t-cmd">omarchy theme set <span class="t-accent">${escapeHtml(theme.slug)}</span></span>
        </div>
        <div>
          <span class="t-ok">✓</span> applied <span class="t-accent">${escapeHtml(theme.name)}</span>
          <span class="t-muted">(${wpCount} ${wpWord} · ${theme.contrast.foreground.toFixed(1)}:1 fg)</span>
        </div>
      </div>

      <div class="term-block">
        <div class="term-prompt-line">
          <span class="t-dir">~/sebthemes</span>
          <span class="t-chevron">❯</span>
          <span class="t-cmd">eza <span class="t-flag">-la</span> <span class="t-arg">themes/${escapeHtml(theme.slug)}</span></span>
        </div>
        <div class="eza-table">${fileRows}</div>
      </div>

      <div class="term-block">
        <div class="term-prompt-line">
          <span class="t-dir">~/sebthemes</span>
          <span class="t-chevron">❯</span>
          <span class="t-cmd">palette <span class="t-muted">--ansi-16</span></span>
        </div>
        <div class="ansi-grid">${ansiCells}</div>
      </div>

      <div class="term-block term-block-fetch">
        <div class="term-prompt-line">
          <span class="t-dir">~/sebthemes</span>
          <span class="t-chevron">❯</span>
          <span class="t-cmd">omarchy theme current</span>
        </div>
        <div class="fetch-grid">
          <span class="fetch-key">theme</span><span class="fetch-val"><span class="t-accent">${escapeHtml(theme.slug)}</span> <span class="t-muted">(${escapeHtml(c.mode)})</span></span>
          <span class="fetch-key">border</span><span class="fetch-val">${escapeHtml(borderDesc)}</span>
          <span class="fetch-key">icons</span><span class="fetch-val">${escapeHtml(theme.iconsTheme)}</span>
          <span class="fetch-key">contrast</span><span class="fetch-val">fg <span style="color:${c.green}">${theme.contrast.foreground.toFixed(1)}:1</span> · accent <span style="color:${c.yellow}">${theme.contrast.accent.toFixed(1)}:1</span> · muted <span style="color:${c.blue}">${theme.contrast.muted.toFixed(1)}:1</span></span>
        </div>
      </div>

      <div class="term-prompt-line">
        <span class="t-dir">~/sebthemes</span>
        <span class="t-branch">main</span>
        <span class="t-chevron">❯</span>
        <span class="term-cursor" aria-hidden="true"></span>
      </div>
    `;
  }

  function renderEditor(theme: ThemeRecord): void {
    const linesHtml = theme.tomlExcerpt
      .slice(0, 14)
      .map((line, i) => {
        const lineNum = i + 1;
        const isCursor = line.startsWith("accent ");
        if (line.startsWith("#")) {
          return `<div class="nvim-line"><span class="nvim-ln">${lineNum}</span><span class="nvim-line-code tok-comment">${escapeHtml(line)}</span></div>`;
        }
        const eq = line.indexOf("=");
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        const hexMatch = /"(#[0-9a-fA-F]{6})"/.exec(val);
        const chip = hexMatch && hexMatch[1]
          ? `<span class="hex-chip" style="background:${hexMatch[1]}"></span>`
          : "";
        return (
          `<div class="nvim-line${isCursor ? " is-cursor" : ""}">` +
          `<span class="nvim-ln">${lineNum}</span>` +
          `<span class="nvim-line-code"><span class="tok-key">${escapeHtml(key)}</span> <span class="tok-eq">=</span> ${chip}<span class="tok-str">${escapeHtml(val)}</span></span>` +
          `</div>`
        );
      })
      .join("");

    nvimCodeEl.innerHTML = linesHtml;
    nvimStatusEl.innerHTML = `
      <div class="nvim-sl-left">
        <span class="nvim-mode">NORMAL</span>
        <span class="nvim-file">themes/${escapeHtml(theme.slug)}/colors.toml</span>
      </div>
      <div class="nvim-sl-right">
        <span class="nvim-meta">toml</span>
        <span class="nvim-pos">${theme.contrast.foreground.toFixed(1)}:1</span>
      </div>
    `;
  }

  function renderBtop(theme: ThemeRecord): void {
    // Exact Omarchy btop.theme.tpl tokens:
    // cpu_box=magenta, mem_box=green, proc_box=accent, cpu=cyan->blue->magenta,
    // used=green->cyan->blue, cached=blue->cyan->magenta, selected=selection/accent
    const c = theme.colors;
    const barsHtml = CPU_BARS.map((pct) => {
      const col = pct >= 48 ? c.magenta : pct >= 32 ? c.blue : c.cyan;
      return `<span class="btop-bar" style="height:${pct}%;--bar-color:${col}"></span>`;
    }).join("");

    btopBodyEl.innerHTML = `
      <div class="btop-panel" style="--panel-color:${c.magenta}">
        <span class="btop-panel-title"><span class="btop-hi">1</span>cpu</span>
        <div class="btop-cpu-row">
          <div class="btop-bars">${barsHtml}</div>
          <div class="btop-cpu-stats">
            <span style="color:${c.bright_foreground};font-weight:600">Ryzen 7 7800X3D</span>
            <span style="color:${c.cyan}">24% · 3.8 GHz</span>
            <span style="color:${c.yellow}">52°C · 41W</span>
          </div>
        </div>
      </div>

      <div class="btop-bottom-grid">
        <div class="btop-panel" style="--panel-color:${c.green}">
          <span class="btop-panel-title"><span class="btop-hi">2</span>mem</span>
          <div class="btop-meter-row">
            <div class="btop-meter-head"><span>Used</span><span style="color:${c.green}">12.4 GiB</span></div>
            <div class="btop-meter-track"><div class="btop-meter-fill" style="width:40%;--meter-color:linear-gradient(90deg, ${c.green}, ${c.cyan})"></div></div>
            <div class="btop-meter-head" style="margin-top:4px"><span>Cache</span><span style="color:${c.cyan}">6.8 GiB</span></div>
            <div class="btop-meter-track"><div class="btop-meter-fill" style="width:22%;--meter-color:linear-gradient(90deg, ${c.blue}, ${c.cyan})"></div></div>
            <div class="btop-meter-head" style="margin-top:4px"><span>Avail</span><span style="color:${c.yellow}">19.6 GiB</span></div>
            <div class="btop-meter-track"><div class="btop-meter-fill" style="width:60%;--meter-color:linear-gradient(90deg, ${c.yellow}, ${c.red})"></div></div>
          </div>
        </div>

        <div class="btop-panel" style="--panel-color:${c.accent}">
          <span class="btop-panel-title"><span class="btop-hi">4</span>proc</span>
          <div class="btop-procs">
            <div class="btop-proc-row btop-proc-head"><span>pid</span><span>program</span><span>mem</span><span>cpu</span></div>
            <div class="btop-proc-row is-selected"><span>412</span><span>hyprland</span><span>94M</span><span>1.4</span></div>
            <div class="btop-proc-row"><span style="color:${c.muted}">608</span><span style="color:${c.foreground}">ghostty</span><span style="color:${c.light_foreground}">68M</span><span style="color:${c.cyan}">0.8</span></div>
            <div class="btop-proc-row"><span style="color:${c.muted}">719</span><span style="color:${c.foreground}">nvim</span><span style="color:${c.light_foreground}">42M</span><span style="color:${c.blue}">0.2</span></div>
            <div class="btop-proc-row"><span style="color:${c.muted}">844</span><span style="color:${c.foreground}">btop</span><span style="color:${c.light_foreground}">14M</span><span style="color:${c.magenta}">0.4</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderWallpaperSwitcher(theme: ThemeRecord): void {
    if (theme.wallpapers.length <= 1) {
      wpSwitcherEl.innerHTML = `<span class="wp-label">1 wallpaper</span>`;
      return;
    }
    const buttons = theme.wallpapers
      .map(
        (wp, idx) =>
          `<button type="button" class="wp-btn${idx === wallpaperIndex ? " is-active" : ""}" data-wp-idx="${idx}" aria-label="Wallpaper ${idx + 1} of ${theme.wallpapers.length}" aria-pressed="${idx === wallpaperIndex}">${wp.label}</button>`
      )
      .join("");
    wpSwitcherEl.innerHTML = `<span class="wp-label">Wallpaper</span>${buttons}`;
  }

  function setPaletteReadout(
    label: string,
    hex: string,
    bgHex: string,
    status: "idle" | "copied" | "failed" = "idle"
  ): void {
    const ratio = contrastOnBg(hex, bgHex).toFixed(1);
    const ratioText = label === "bg" ? "surface" : `${ratio}:1`;
    if (status === "copied") {
      paletteReadoutEl.innerHTML = `<strong>${escapeHtml(label)}</strong> ${escapeHtml(hex)} <span class="copied-tag">· Copied</span>`;
      return;
    }
    if (status === "failed") {
      paletteReadoutEl.innerHTML = `<strong>${escapeHtml(label)}</strong> ${escapeHtml(hex)} <span class="failed-tag">· Copy failed</span>`;
      return;
    }
    paletteReadoutEl.innerHTML = `<strong>${escapeHtml(label)}</strong> ${escapeHtml(hex)} · ${ratioText}`;
  }

  function renderPaletteSwatches(theme: ThemeRecord): void {
    paletteSwatchesEl.innerHTML = SWATCH_SPEC.map((spec) => {
      const hex = theme.colors[spec.key];
      return `<button type="button" class="swatch-btn${spec.isAccent ? " is-accent" : ""}" data-swatch-label="${spec.label}" data-swatch-hex="${hex}" style="background:${hex}" title="${spec.label} ${hex}" aria-label="Copy ${spec.label} ${hex}"></button>`;
    }).join("");
    setPaletteReadout("accent", theme.colors.accent, theme.colors.background);
  }

  function renderInstallCommands(theme: ThemeRecord): void {
    const raw = getInstallCommand(theme, installMode);
    const html = renderInstallCommandHtml(theme, installMode);
    installCmdEl.innerHTML = html;
    installCmdEl.dataset.raw = raw;
    mobileInstallCmdEl.innerHTML = html;
    mobileInstallCmdEl.dataset.raw = raw;
  }

  function syncMenuAndRail(theme: ThemeRecord): void {
    const railCards = themeRailEl.querySelectorAll<HTMLButtonElement>(".theme-card");
    railCards.forEach((card, idx) => {
      const active = idx === activeIndex;
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-selected", String(active));
      if (active && window.innerWidth <= 1180) {
        card.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    });

    const menuItems = menuListEl.querySelectorAll<HTMLButtonElement>(".menu-item");
    menuItems.forEach((item, idx) => {
      const active = idx === activeIndex;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });

    waybarThemeEl.textContent = theme.slug;
    const wp = theme.wallpapers[wallpaperIndex] ?? theme.wallpapers[0]!;
    wpBadgeFileEl.textContent = wp.filename;
    wpBadgeIndexEl.textContent = `${wallpaperIndex + 1} / ${theme.wallpapers.length}`;
  }

  function selectTheme(index: number, opts?: { instant?: boolean; updateHash?: boolean }): void {
    const normalized = ((index % themes.length) + themes.length) % themes.length;
    const theme = themes[normalized];
    if (!theme) return;

    const instant = Boolean(opts?.instant);
    activeIndex = normalized;
    wallpaperIndex = 0;

    applyThemeVars(theme);
    syncAllWindowBorders(theme, instant);
    const wp = theme.wallpapers[0]!;
    showWallpaper(wp.src, instant);
    preloadNeighbors(normalized);

    themeCounterEl.textContent = `${String(normalized + 1).padStart(2, "0")} / ${String(themes.length).padStart(2, "0")}`;
    themeNameEl.textContent = theme.name;
    themeTaglineEl.textContent = theme.tagline;

    renderTerminal(theme);
    renderEditor(theme);
    renderBtop(theme);
    renderWallpaperSwitcher(theme);
    renderPaletteSwatches(theme);
    renderInstallCommands(theme);
    syncMenuAndRail(theme);

    if (opts?.updateHash !== false) {
      try {
        history.replaceState(null, "", `#${theme.slug}`);
      } catch {
        // ignore in restricted contexts
      }
    }
  }

  function selectWallpaper(idx: number): void {
    const theme = themes[activeIndex];
    if (!theme || theme.wallpapers.length === 0) return;
    wallpaperIndex = ((idx % theme.wallpapers.length) + theme.wallpapers.length) % theme.wallpapers.length;
    const wp = theme.wallpapers[wallpaperIndex]!;
    showWallpaper(wp.src, false);
    renderWallpaperSwitcher(theme);
    wpBadgeFileEl.textContent = wp.filename;
    wpBadgeIndexEl.textContent = `${wallpaperIndex + 1} / ${theme.wallpapers.length}`;
  }

  function setWorkspace(ws: number): void {
    activeWorkspace = ws;
    desktopFrame.dataset.workspace = String(ws);
    desktopFrame.querySelectorAll<HTMLButtonElement>(".ws-btn").forEach((btn) => {
      const isActive = Number(btn.dataset.ws) === ws;
      btn.classList.toggle("is-active", isActive);
    });
    const menuLayer = byId<HTMLElement>("omarchy-menu-layer");
    menuLayer.setAttribute("aria-hidden", String(ws !== 3));
    const badge = byId<HTMLElement>("wallpaper-only-badge");
    badge.setAttribute("aria-hidden", String(ws !== 4));
    const theme = themes[activeIndex];
    if (theme) syncAllWindowBorders(theme, false);
  }

  function setFocusedWindow(win: FocusedWindow): void {
    focusedWindow = win;
    desktopFrame.dataset.focused = win;
    const theme = themes[activeIndex];
    if (theme) syncAllWindowBorders(theme, false);
  }

  function setInstallMode(mode: InstallMode): void {
    installMode = mode;
    document.querySelectorAll<HTMLButtonElement>("[data-install-mode]").forEach((btn) => {
      const active = btn.dataset.installMode === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    const theme = themes[activeIndex];
    if (theme) renderInstallCommands(theme);
  }

  async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to execCommand fallback
      }
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function selectElementText(el: HTMLElement): void {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function triggerInstallCopy(): Promise<void> {
    const theme = themes[activeIndex];
    if (!theme) return;
    const cmd = getInstallCommand(theme, installMode);
    const ok = await copyText(cmd);

    copyInstallBtn.classList.remove("is-copied", "is-failed");
    mobileCopyBtn.classList.remove("is-copied", "is-failed");

    if (ok) {
      copyInstallBtn.classList.add("is-copied");
      copyInstallLabel.textContent = "Copied";
      mobileCopyBtn.classList.add("is-copied");
      mobileCopyLabel.textContent = "Copied to clipboard";
    } else {
      copyInstallBtn.classList.add("is-failed");
      copyInstallLabel.textContent = "Copy failed";
      mobileCopyBtn.classList.add("is-failed");
      mobileCopyLabel.textContent = "Copy failed — select above";
      selectElementText(window.innerWidth <= 760 ? mobileInstallCmdEl : installCmdEl);
    }

    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyInstallBtn.classList.remove("is-copied", "is-failed");
      copyInstallLabel.textContent = "Copy";
      mobileCopyBtn.classList.remove("is-copied", "is-failed");
      mobileCopyLabel.textContent = "Copy install command";
    }, 2000);
  }

  function updateClock(): void {
    const now = new Date();
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = days[now.getDay()] ?? "Thu";
    const m = months[now.getMonth()] ?? "Nov";
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    waybarClockEl.textContent = `${d} ${now.getDate()} ${m} ${hh}:${mm}`;
  }

  function buildStaticLists(): void {
    document.querySelectorAll<HTMLElement>("[data-all-count]").forEach((el) => {
      el.textContent = `All ${themes.length}`;
    });

    themeRailEl.innerHTML = themes
      .map(
        (t, idx) => `
        <button type="button" class="theme-card" role="option" aria-selected="false" data-theme-idx="${idx}"
          style="--card-accent:${t.colors.accent};--card-border:${t.activeBorder.css}">
          <img class="theme-card-thumb" src="${t.thumb}" alt="${escapeHtml(t.name)}" loading="eager" decoding="async">
          <span class="theme-card-stripe" aria-hidden="true"></span>
          <span class="theme-card-foot">
            <span class="theme-card-name">${escapeHtml(t.shortName)}</span>
            <span class="theme-card-dot" aria-hidden="true"></span>
          </span>
        </button>`
      )
      .join("");

    menuCountEl.textContent = `${themes.length} themes`;
    menuListEl.innerHTML = themes
      .map(
        (t, idx) => `
        <button type="button" class="menu-item" role="option" aria-selected="false" data-menu-idx="${idx}">
          <span class="menu-item-left">
            <span class="menu-swatch" style="background:${t.activeBorder.css}"></span>
            <span>${escapeHtml(t.name)}</span>
          </span>
          <span class="menu-item-slug">${escapeHtml(t.slug)}</span>
        </button>`
      )
      .join("");
  }

  // Wire events
  themeRailEl.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-theme-idx]");
    if (card && card.dataset.themeIdx !== undefined) {
      selectTheme(Number(card.dataset.themeIdx));
    }
  });

  menuListEl.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-menu-idx]");
    if (item && item.dataset.menuIdx !== undefined) {
      selectTheme(Number(item.dataset.menuIdx));
    }
  });

  wpSwitcherEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-wp-idx]");
    if (btn && btn.dataset.wpIdx !== undefined) {
      selectWallpaper(Number(btn.dataset.wpIdx));
    }
  });

  paletteSwatchesEl.addEventListener("mouseover", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-swatch-hex]");
    const theme = themes[activeIndex];
    if (btn && theme && btn.dataset.swatchLabel && btn.dataset.swatchHex) {
      setPaletteReadout(btn.dataset.swatchLabel, btn.dataset.swatchHex, theme.colors.background);
    }
  });

  paletteSwatchesEl.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-swatch-hex]");
    const theme = themes[activeIndex];
    if (!btn || !theme || !btn.dataset.swatchLabel || !btn.dataset.swatchHex) return;
    const ok = await copyText(btn.dataset.swatchHex);
    setPaletteReadout(
      btn.dataset.swatchLabel,
      btn.dataset.swatchHex,
      theme.colors.background,
      ok ? "copied" : "failed"
    );
    window.clearTimeout(swatchCopyTimer);
    swatchCopyTimer = window.setTimeout(() => {
      const current = themes[activeIndex];
      if (current) setPaletteReadout("accent", current.colors.accent, current.colors.background);
    }, 1800);
  });

  desktopFrame.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const wsBtn = target.closest<HTMLButtonElement>(".ws-btn[data-ws]");
    if (wsBtn && wsBtn.dataset.ws) {
      setWorkspace(Number(wsBtn.dataset.ws));
      return;
    }
    const winEl = target.closest<HTMLElement>(".hypr-win[data-win]");
    if (winEl && winEl.dataset.win && winEl.dataset.win !== "menu") {
      const w = winEl.dataset.win as FocusedWindow;
      if (w !== focusedWindow) setFocusedWindow(w);
    }
  });

  // Phone touch swipe on desktop preview to step between themes
  let touchStartX: number | null = null;
  let touchStartY: number | null = null;

  desktopFrame.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true }
  );

  desktopFrame.addEventListener(
    "touchend",
    (e) => {
      if (touchStartX === null || touchStartY === null) return;
      const touch = e.changedTouches[0];
      const startX = touchStartX;
      const startY = touchStartY;
      touchStartX = null;
      touchStartY = null;
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        if (dx < 0) selectTheme(activeIndex + 1);
        else selectTheme(activeIndex - 1);
      }
    },
    { passive: true }
  );

  document.querySelectorAll<HTMLButtonElement>("[data-install-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.installMode as InstallMode | undefined;
      if (mode) setInstallMode(mode);
    });
  });

  installCmdEl.addEventListener("click", () => {
    void triggerInstallCopy();
  });
  copyInstallBtn.addEventListener("click", () => {
    void triggerInstallCopy();
  });
  mobileCopyBtn.addEventListener("click", () => {
    void triggerInstallCopy();
  });

  prevThemeBtn.addEventListener("click", () => selectTheme(activeIndex - 1));
  nextThemeBtn.addEventListener("click", () => selectTheme(activeIndex + 1));

  // Keyboard navigation — respects focused interactive controls
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl) {
      const tag = activeEl.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || activeEl.isContentEditable) {
        return;
      }
      // Let tablist, non-rail buttons, and links keep native keyboard behavior
      if (activeEl.closest('[role="tablist"]')) {
        return;
      }
      const isControl = tag === "BUTTON" || tag === "A";
      const isThemeStepper =
        activeEl.classList.contains("theme-card") ||
        activeEl.classList.contains("menu-item") ||
        activeEl.id === "prev-theme-btn" ||
        activeEl.id === "next-theme-btn";
      if (isControl && !isThemeStepper) {
        return;
      }
    }

    if (e.key === "ArrowRight" || e.key === "l") {
      e.preventDefault();
      selectTheme(activeIndex + 1);
    } else if (e.key === "ArrowLeft" || e.key === "h") {
      e.preventDefault();
      selectTheme(activeIndex - 1);
    } else if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
      setWorkspace(Number(e.key));
    } else if (e.key === "w" || e.key === "W") {
      selectWallpaper(wallpaperIndex + 1);
    } else if (e.key === "c" || e.key === "C") {
      void triggerInstallCopy();
    }
  });

  window.addEventListener("resize", () => {
    const theme = themes[activeIndex];
    if (theme) syncAllWindowBorders(theme, true);
  });

  window.addEventListener("hashchange", () => {
    const slug = window.location.hash.replace(/^#/, "");
    const idx = themes.findIndex((t) => t.slug === slug);
    if (idx !== -1 && idx !== activeIndex) {
      selectTheme(idx, { updateHash: false });
    }
  });

  // Initialize
  buildStaticLists();
  updateClock();
  window.setInterval(updateClock, 30000);

  const initialHash = window.location.hash.replace(/^#/, "");
  const initialIdx = themes.findIndex((t) => t.slug === initialHash);
  selectTheme(initialIdx !== -1 ? initialIdx : 0, { instant: true, updateHash: false });

  requestAnimationFrame(() => {
    document.documentElement.dataset.ready = "true";
  });
})();
