import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { projectRoot } from "./paths";
import { isQueueBusy } from "./queue";

/**
 * Self-update from GitHub.
 *
 *  - The installed version is the commit sha in data/update-state.json (or the
 *    local .git checkout as a fallback).
 *  - "Check" compares it with the branch head on GitHub. When the local commit
 *    is known, the compare API gives the exact list of changed files and only
 *    those are downloaded (raw.githubusercontent.com); removed files are deleted.
 *    When it is unknown (first install from "Download ZIP") or the history does
 *    not line up, local files are compared with GitHub's file tree by git blob
 *    hash: identical files are skipped, so a fresh install adopts the version
 *    without downloading anything.
 *  - Files are written while the server keeps serving the previous build, then
 *    the process exits with RESTART_EXIT_CODE. scripts/panel.ps1 (BASLAT.bat)
 *    sees that code, re-installs packages / rebuilds only if needed, and starts
 *    the server again.
 */

export const RESTART_EXIT_CODE = 42;

const REPO = () => (process.env.UPDATE_REPO || "mehmetsozd/etsyposter").trim();
const BRANCH = () => (process.env.UPDATE_BRANCH || "main").trim();
const API = "https://api.github.com";
const CHECK_CACHE_MS = 5 * 60 * 1000;
const HTTP_TIMEOUT_MS = 60_000;

const STATE_FILE = path.join(projectRoot, "data", "update-state.json");

// Never written, overwritten or deleted by an update: user settings, products,
// uploaded static images, installed packages and the build.
const PROTECTED_PREFIXES = [
  ".env.local",
  ".git/",
  ".next/",
  "node_modules/",
  "data/",
  "video_mockups/",
  "public/workspace/",
  "public/etsy-static-mockups/",
];

export function isProtectedPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.split("/").includes("..")) return true;
  return PROTECTED_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? p === prefix.slice(0, -1) || p.startsWith(prefix) : p === prefix
  );
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string | null;
}

export interface UpdateStatus {
  repo: string;
  branch: string;
  current: { sha: string | null; updatedAt: string | null; source: "state" | "git" | "unknown" };
  latest: CommitInfo | null;
  updateAvailable: boolean;
  /** "delta" = changed files from the commit diff; "tree" = files whose content differs from GitHub. */
  mode: "delta" | "tree" | null;
  commits: CommitInfo[];
  changedFiles: { path: string; status: string }[];
  canApply: boolean;
  reason: string | null;
  checkedAt: string;
  error: string | null;
}

interface CompareFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  previous_filename?: string;
}

interface UpdateGlobals {
  cache?: { at: number; status: UpdateStatus };
  applying?: boolean;
}
const g = globalThis as unknown as { __posterUpdate?: UpdateGlobals };
const mem: UpdateGlobals = (g.__posterUpdate ??= {});

// ---- HTTP -----------------------------------------------------------------

async function http(url: string, accept = "application/vnd.github+json"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: accept, "User-Agent": "poster-studio-updater" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error("GitHub istek sınırına takıldı. Birkaç dakika sonra tekrar dene.");
    }
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${url}`);
    return res;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new Error("GitHub'a bağlanılamadı (zaman aşımı).");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function githubJson<T>(apiPath: string): Promise<T> {
  return (await (await http(`${API}${apiPath}`)).json()) as T;
}

function toCommit(c: { sha: string; commit?: { message?: string; author?: { date?: string } } }): CommitInfo {
  return {
    sha: c.sha,
    message: (c.commit?.message ?? "").split("\n")[0],
    date: c.commit?.author?.date ?? null,
  };
}

// ---- Local version --------------------------------------------------------

async function readGitHead(): Promise<string | null> {
  try {
    const gitDir = path.join(/*turbopackIgnore: true*/ projectRoot, ".git");
    const head = (await fs.readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = head.replace(/^ref:\s*/, "");
    try {
      return (await fs.readFile(path.join(gitDir, ref), "utf8")).trim();
    } catch {
      const packed = await fs.readFile(path.join(gitDir, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
      return line ? line.split(" ")[0] : null;
    }
  } catch {
    return null;
  }
}

async function readCurrent(): Promise<UpdateStatus["current"]> {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as { sha?: string; updatedAt?: string };
    if (raw.sha) return { sha: raw.sha, updatedAt: raw.updatedAt ?? null, source: "state" };
  } catch {}
  const git = await readGitHead();
  if (git) return { sha: git, updatedAt: null, source: "git" };
  return { sha: null, updatedAt: null, source: "unknown" };
}

async function writeCurrent(sha: string): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(
    STATE_FILE,
    JSON.stringify({ sha, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

// ---- Content comparison (version unknown) -----------------------------------

/** Same hash git uses for a file's content: sha1("blob <size>\0" + bytes). */
async function gitBlobSha(absPath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(absPath);
    return crypto
      .createHash("sha1")
      .update(`blob ${data.length}\0`)
      .update(data)
      .digest("hex");
  } catch {
    return null;
  }
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(abs, base)));
    else if (entry.isFile()) out.push(path.relative(base, abs).replace(/\\/g, "/"));
  }
  return out;
}

// Code folders are mirrored: a file deleted upstream is deleted locally too.
const MIRRORED_DIRS = ["app", "scripts"];

async function treeDiff(
  repo: string,
  sha: string
): Promise<{ writes: string[]; removes: string[] }> {
  const tree = await githubJson<{
    tree: { path: string; type: string; sha: string }[];
    truncated: boolean;
  }>(`/repos/${repo}/git/trees/${sha}?recursive=1`);
  if (tree.truncated) throw new Error("GitHub dosya listesi eksik geldi; tekrar dene.");
  const writes: string[] = [];
  const upstream = new Set<string>();
  for (const entry of tree.tree) {
    if (entry.type !== "blob" || isProtectedPath(entry.path)) continue;
    upstream.add(entry.path);
    const local = await gitBlobSha(path.join(/*turbopackIgnore: true*/ projectRoot, entry.path));
    if (local !== entry.sha) writes.push(entry.path);
  }
  const removes: string[] = [];
  for (const dir of MIRRORED_DIRS) {
    const abs = path.join(/*turbopackIgnore: true*/ projectRoot, dir);
    const existing = await listFiles(abs).catch(() => [] as string[]);
    for (const rel of existing.map((p) => `${dir}/${p}`)) {
      if (!upstream.has(rel) && !isProtectedPath(rel)) removes.push(rel);
    }
  }
  return { writes, removes };
}

// ---- Check ----------------------------------------------------------------

function launcherReason(): string | null {
  if (process.env.POSTER_STUDIO_LAUNCHER !== "1") {
    return "Güncelleme yalnızca BASLAT.bat ile açılan panelde yapılabilir (geliştirme modunda kapalı).";
  }
  return null;
}

export async function checkForUpdate(force = false): Promise<UpdateStatus> {
  if (!force && mem.cache && Date.now() - mem.cache.at < CHECK_CACHE_MS) {
    // Re-evaluate the cheap local parts (queue, launcher) on every call.
    return withApplyGate(mem.cache.status);
  }
  const repo = REPO();
  const branch = BRANCH();
  const current = await readCurrent();
  const base: UpdateStatus = {
    repo,
    branch,
    current,
    latest: null,
    updateAvailable: false,
    mode: null,
    commits: [],
    changedFiles: [],
    canApply: false,
    reason: null,
    checkedAt: new Date().toISOString(),
    error: null,
  };

  try {
    const head = toCommit(await githubJson(`/repos/${repo}/commits/${encodeURIComponent(branch)}`));
    base.latest = head;

    let needTree = false;
    if (current.sha && current.sha === head.sha) {
      // up to date
    } else if (current.sha) {
      try {
        const cmp = await githubJson<{
          status: string;
          commits: Parameters<typeof toCommit>[0][];
          files?: CompareFile[];
        }>(`/repos/${repo}/compare/${current.sha}...${head.sha}`);
        if (cmp.status === "behind" || cmp.status === "identical") {
          // local is ahead of / equal to GitHub (e.g. the developer's machine)
        } else if (cmp.status === "ahead" && (cmp.files ?? []).length < 300) {
          base.updateAvailable = true;
          base.mode = "delta";
          base.commits = cmp.commits.map(toCommit).reverse().slice(0, 30);
          base.changedFiles = (cmp.files ?? []).map((f) => ({ path: f.filename, status: f.status }));
        } else {
          needTree = true; // diverged, or too many files for the compare API
        }
      } catch {
        needTree = true; // local commit unknown to GitHub
      }
    } else {
      needTree = true; // fresh install from "Download ZIP"
    }

    if (needTree) {
      const diff = await treeDiff(repo, head.sha);
      if (diff.writes.length === 0 && diff.removes.length === 0) {
        // Files already match GitHub: adopt that version, nothing to download.
        await writeCurrent(head.sha);
        base.current = await readCurrent();
      } else {
        base.updateAvailable = true;
        base.mode = "tree";
        base.commits = [head];
        base.changedFiles = [
          ...diff.writes.map((p) => ({ path: p, status: "modified" })),
          ...diff.removes.map((p) => ({ path: p, status: "removed" })),
        ];
      }
    }
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
  }

  mem.cache = { at: Date.now(), status: base };
  return withApplyGate(base);
}

function withApplyGate(status: UpdateStatus): UpdateStatus {
  let reason = launcherReason();
  if (!reason && isQueueBusy()) reason = "Üretim kuyruğu çalışıyor. Kuyruk bitince güncelle.";
  if (!reason && mem.applying) reason = "Güncelleme zaten uygulanıyor.";
  return {
    ...status,
    canApply: status.updateAvailable && !status.error && !reason,
    reason,
  };
}

// ---- Apply ----------------------------------------------------------------

async function downloadRaw(repo: string, sha: string, relPath: string): Promise<Buffer> {
  const encoded = relPath.split("/").map(encodeURIComponent).join("/");
  const res = await http(`https://raw.githubusercontent.com/${repo}/${sha}/${encoded}`, "*/*");
  return Buffer.from(await res.arrayBuffer());
}

async function writeFileSafe(relPath: string, data: Buffer): Promise<void> {
  const target = path.join(/*turbopackIgnore: true*/ projectRoot, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.update-tmp`;
  await fs.writeFile(tmp, data);
  await fs.rm(target, { force: true });
  await fs.rename(tmp, target);
}

async function removeFileSafe(relPath: string): Promise<void> {
  await fs.rm(path.join(/*turbopackIgnore: true*/ projectRoot, relPath), { force: true });
}

/** Only the changed files. Everything is downloaded before anything is written. */
async function applyDelta(repo: string, from: string, to: string): Promise<number> {
  const cmp = await githubJson<{ files?: CompareFile[] }>(`/repos/${repo}/compare/${from}...${to}`);
  const writes: { path: string; data: Buffer }[] = [];
  const removes: string[] = [];
  for (const f of cmp.files ?? []) {
    if (f.status === "removed") {
      if (!isProtectedPath(f.filename)) removes.push(f.filename);
      continue;
    }
    if (f.status === "renamed" && f.previous_filename && !isProtectedPath(f.previous_filename)) {
      removes.push(f.previous_filename);
    }
    if (f.status === "unchanged" || isProtectedPath(f.filename)) continue;
    writes.push({ path: f.filename, data: await downloadRaw(repo, to, f.filename) });
  }
  for (const w of writes) await writeFileSafe(w.path, w.data);
  for (const r of removes) await removeFileSafe(r);
  return writes.length + removes.length;
}

/** Files whose content differs from GitHub (version unknown / history diverged). */
async function applyTree(repo: string, to: string): Promise<number> {
  const { writes, removes } = await treeDiff(repo, to);
  const downloaded: { path: string; data: Buffer }[] = [];
  for (const p of writes) downloaded.push({ path: p, data: await downloadRaw(repo, to, p) });
  for (const w of downloaded) await writeFileSafe(w.path, w.data);
  for (const r of removes) await removeFileSafe(r);
  return writes.length + removes.length;
}

export async function applyUpdate(): Promise<{ sha: string; mode: "delta" | "tree"; files: number }> {
  const status = await checkForUpdate(true);
  if (status.error) throw new Error(status.error);
  if (!status.updateAvailable || !status.latest) throw new Error("Güncelleme yok; panel zaten güncel.");
  if (!status.canApply) throw new Error(status.reason ?? "Güncelleme şu an uygulanamıyor.");

  mem.applying = true;
  try {
    const repo = status.repo;
    const to = status.latest.sha;
    const mode = status.mode === "delta" && status.current.sha ? "delta" : "tree";
    const files =
      mode === "delta"
        ? await applyDelta(repo, status.current.sha as string, to)
        : await applyTree(repo, to);
    await writeCurrent(to);
    mem.cache = undefined;
    console.log(`[update] ${mode} → ${to.slice(0, 7)} (${files} dosya). Yeniden başlatılıyor…`);
    // Let the HTTP response flush, then hand over to the launcher.
    setTimeout(() => process.exit(RESTART_EXIT_CODE), 1000);
    return { sha: to, mode, files };
  } catch (error) {
    mem.applying = false;
    throw error;
  }
}
