// Servidor local para ver a tela: worker REAL + SQLite em memória + Tiny FALSO (só para o contato). Uso: bun run servidor_local.ts
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import worker from "../app/src/worker";
import { REAIS_GOBEAUTE } from "../app/src/reais";
import * as A from "../app/src/agente";

const sqlite = new Database(":memory:");
const DB = { exec: async (s: string, p: unknown[]) => { sqlite.query(s).run(...(p as any[])); return {}; }, query: async (s: string, p: unknown[]) => ({ rows: sqlite.query(s).all(...(p as any[])) as any[] }) };
// Tiny falso: só o 1º cliente a abordar do 1º produto com ações tem contato
const prim = (REAIS_GOBEAUTE as any[]).map(p => A.analisar(p, { produtos: [p], clientes: [], pedidos: [] })).map(a => a.mensagens.find(m => m.time === "B2B")!).find(m => m.acoes?.length)!.acoes![0].cliente;
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (u: string, init?: any) => {
  if (!String(u).startsWith("https://proxy.test")) return realFetch(u, init);
  const url = new URL(u); const pad = decodeURIComponent(url.searchParams.get("nome_cliente") ?? "");
  const nome = prim.toUpperCase().replace(/ ME$/, " - ME");
  const rx = new RegExp("^" + pad.replace("ilike.", "").replace(/\*/g, ".*").replace(/_/g, ".") + "$", "i");
  return new Response(JSON.stringify(url.pathname.endsWith("tiny_pedidos_apice_atacado_sp") && rx.test(nome)
    ? [{ nome_cliente: nome, fone_cliente: "(12) 98888-7777", email_cliente: "compras@exemplo.com", cpf_cnpj_cliente: "1", data_pedido: "2026-10-08T00:00:00-03:00" }] : []), { status: 200 });
};
const env: any = { DB, PROXY_BASE_URL: "https://proxy.test" };
const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
Bun.serve({ port: 8799, async fetch(req) {
  const u = new URL(req.url);
  if (u.pathname === "/") return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  return worker.fetch(req, env);
} });
console.log("pronto em http://localhost:8799  (cliente com contato falso:", prim + ")");
