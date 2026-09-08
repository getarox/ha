import { ENV } from "./_core/env.js";

type Result = { title: string; url: string; snippet: string; source: string };
async function get(url: string, init?: RequestInit) { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(`search ${r.status}`); return r.json(); }
function clean(items: Result[]) { const seen = new Set<string>(); return items.filter((x) => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 20); }

async function google(q: string): Promise<Result[]> { if (!ENV.googleApiKey || !ENV.googleSearchCx) return []; const d = await get(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(ENV.googleApiKey)}&cx=${encodeURIComponent(ENV.googleSearchCx)}&q=${encodeURIComponent(q)}`); return (d.items ?? []).map((x: any) => ({ title: x.title, url: x.link, snippet: x.snippet ?? "", source: "Google" })); }
async function searxng(q: string): Promise<Result[]> { if (!ENV.searxngUrl) return []; const base = ENV.searxngUrl.replace(/\/$/, ""); const d = await get(`${base}/search?q=${encodeURIComponent(q)}&format=json`); return (d.results ?? []).map((x: any) => ({ title: x.title, url: x.url, snippet: x.content ?? "", source: "SearXNG" })); }
async function duck(q: string): Promise<Result[]> { const d = await get(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`); const out: Result[] = []; if (d.AbstractURL) out.push({ title: d.Heading || q, url: d.AbstractURL, snippet: d.AbstractText || "", source: "DuckDuckGo" }); for (const x of d.RelatedTopics ?? []) if (x.FirstURL) out.push({ title: x.Text || q, url: x.FirstURL, snippet: x.Text || "", source: "DuckDuckGo" }); return out; }
async function brave(q: string): Promise<Result[]> { if (!ENV.braveApiKey) return []; const d = await get(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}`, { headers: { "X-Subscription-Token": ENV.braveApiKey, Accept: "application/json" } }); return (d.web?.results ?? []).map((x: any) => ({ title: x.title, url: x.url, snippet: x.description ?? "", source: "Brave" })); }

export async function searchWeb(query: string) { const tasks = [google(query), searxng(query), duck(query), brave(query)]; const results = (await Promise.allSettled(tasks)).flatMap((x) => x.status === "fulfilled" ? x.value : []); return clean(results); }
export function formatSearchContext(results: Result[]) { return results.length ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.url}\nSource: ${r.source}`).join("\n\n") : ""; }
