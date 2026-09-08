import { ENV } from "./_core/env.js";

type Result = { title: string; url: string; snippet: string; source: string };
async function get(url: string, init?: RequestInit) { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(3500) }); if (!r.ok) throw new Error(`search ${r.status}`); return r.json(); }
function clean(items: Result[]) { const seen = new Set<string>(); return items.filter((x) => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 20); }

async function searxng(q: string): Promise<Result[]> { if (!ENV.searxngUrl) return []; const base = ENV.searxngUrl.replace(/\/$/, ""); const d = await get(`${base}/search?q=${encodeURIComponent(q)}&format=json`); return (d.results ?? []).map((x: any) => ({ title: x.title, url: x.url, snippet: x.content ?? "", source: "SearXNG" })); }
async function duck(q: string): Promise<Result[]> { const d = await get(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`); const out: Result[] = []; if (d.AbstractURL) out.push({ title: d.Heading || q, url: d.AbstractURL, snippet: d.AbstractText || "", source: "DuckDuckGo" }); for (const x of d.RelatedTopics ?? []) if (x.FirstURL) out.push({ title: x.Text || q, url: x.FirstURL, snippet: x.Text || "", source: "DuckDuckGo" }); return out; }

export async function searchWeb(query: string) { const tasks = [searxng(query), duck(query)]; const results = (await Promise.allSettled(tasks)).flatMap((x) => x.status === "fulfilled" ? x.value : []); return clean(results); }
export function formatSearchContext(results: Result[]) { return results.length ? results.slice(0, 6).map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet.slice(0, 260)}\nURL: ${r.url}\nSource: ${r.source}`).join("\n\n") : ""; }
