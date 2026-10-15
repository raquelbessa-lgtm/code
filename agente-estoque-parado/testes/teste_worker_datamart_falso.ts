// teste do worker com um Data Mart FALSO só para validar o parsing/paginação do código (os números do Data Mart real vieram das consultas feitas antes)
import worker from "../app/src/worker";
const calls: string[] = [];
const rowsSales = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, sale_date: i < 900 ? "2026-09-0" + (1 + (i % 7)) : "2026-08-1" + (i % 9), sales_quantity: 2, invoicing: 100 }));
(globalThis as any).fetch = async (u: string, init: any) => {
  calls.push(u);
  const url = new URL(u); const p = url.pathname;
  const ok = (b: any) => new Response(JSON.stringify(b), { status: 200 });
  if (p.endsWith("api.supply_fluxo_estoque") && url.searchParams.get("select") === "loaded_at") return ok([{ loaded_at: "2026-09-08T12:05:40" }]);
  if (p.endsWith("api.supply_fluxo_estoque") && url.searchParams.get("line")) return ok([{ item_status: "Linha/Recompra", day1_stock: 118330, unit_cost: 43.0501, po_pending: 159932 }]);
  if (p.endsWith("api.supply_fluxo_estoque")) return ok([{ line: "Mini Tote", item_status: "Linha/Recompra", day1_stock: 118330, unit_cost: 43.05, day1_value_brl: 5094114 }]);
  if (p.endsWith("api.supply_sales") && url.searchParams.get("select") === "sale_date") return ok([{ sale_date: "2026-09-07" }]);
  if (p.endsWith("api.supply_sales")) { const off = Number(url.searchParams.get("offset")); return ok(rowsSales.slice(off, off + 1000)); }
  return new Response("nope", { status: 404 });
};
const env: any = { PROXY_BASE_URL: "https://proxy.test", DB: { exec: async () => ({}), query: async () => ({ rows: [] }) } };
const get = async (path: string) => (await worker.fetch(new Request("https://app.test" + path, { headers: { cookie: "sid=1" } }), env)).json();
console.log("status   ", JSON.stringify(await get("/api/status")));
console.log("linhas   ", JSON.stringify(await get("/api/linhas")));
console.log("linha    ", JSON.stringify(await get("/api/datamart/linha?linha=" + encodeURIComponent("Mini Tote"))));
console.log("sem linha", JSON.stringify(await get("/api/datamart/linha")));
console.log("influencia tiers", JSON.stringify((await get("/api/influencia") as any).tiers));
console.log("paginas de vendas:", calls.filter(c => c.includes("api.supply_sales") && c.includes("offset")).length);
// radar com produto real vindo do POST /api/produtos
const store: any[] = []; env.DB = { exec: async (sql: string, p: any[]) => { if (sql.startsWith("INSERT OR REPLACE")) store.push({ dados: p[1] }); return {}; }, query: async () => ({ rows: store }) };
const post = await (await worker.fetch(new Request("https://app.test/api/produtos", { method: "POST", body: JSON.stringify({ produto: "Copo Vibe 470ml", marca: "Gocase", categoria: "Copos e garrafas", situacao: "linha", estoque_un: "130720", custo_unit_brl: "27,37", preco_cheio_brl: "118,20", venda_media_30d_un: "6352", venda_30d_anteriores_un: "12905", po_pendente_un: "" }) }), env)).json() as any;
console.log("POST produtos ok:", post.ok, "| classe:", post.analise?.classe, "| influência:", post.analise?.mensagens.find((m: any) => m.time === "Influência").oQueFazer.slice(0, 90));
const rad = await (await worker.fetch(new Request("https://app.test/api/radar"), env)).json() as any;
console.log("radar reais:", rad.reais.length, "| parados:", rad.parados.length, "| emRisco:", rad.emRisco.length);
const bad = await worker.fetch(new Request("https://app.test/api/produtos", { method: "POST", body: JSON.stringify({ produto: "", estoque_un: "x" }) }), env);
console.log("POST inválido:", bad.status, JSON.stringify(await bad.json()));
