// Agente de Estoque Parado: API do agente no GoDeploy.
// GET  /api/radar            radar com parados, entrando em slow moving e a ação de cada time
// POST /api/produtos         cadastra um produto real para o teste (fica no env.DB)
// POST /api/enviar           envia as mensagens escolhidas para o Google Chat (env.CHAT_WEBHOOK_URL)
// POST /api/ia               reescreve os textos de Growth com o AI Proxy (env.AI_PROXY_KEY), se configurado
// GET  /api/status           o que está configurado
import { DATA } from "./data";
import { REAIS_GOCASE, REAIS_INFO, REAIS_GOBEAUTE, REAIS_GOBEAUTE_INFO, REAIS_GOBEAUTE_B2C, REAIS_GOBEAUTE_B2C_INFO } from "./reais";
import { analisar, radar, textoChat, type Base, type Produto } from "./agente";

type Env = {
  DB: { query: (sql: string, p: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string, p: unknown[]) => Promise<unknown> };
  CHAT_WEBHOOK_URL?: string;
  AI_PROXY_KEY?: string;
  AI_MODEL?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

async function setup(env: Env) {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS produtos_reais (sku TEXT PRIMARY KEY, dados TEXT NOT NULL, criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')))`, []);
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS envios (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, time TEXT, ok INTEGER, enviado_por TEXT, enviado_em TEXT DEFAULT (datetime('now')))`, []);
}

// fonte "ficticia": base do hackathon com clientes fictícios. fonte "real": dados reais da Gocase, sem clientes.
// Sem fonte (envio e IA): as duas juntas, para achar qualquer SKU.
async function base(env: Env, fonte?: string): Promise<Base> {
  const r = await env.DB.query(`SELECT dados FROM produtos_reais ORDER BY criado_em DESC`, []);
  const cadastrados = r.rows.map(x => JSON.parse(String(x.dados)) as Produto);
  const ficticios = DATA.produtos as unknown as Produto[];
  if (fonte === "real") return { produtos: [...cadastrados, ...REAIS_GOCASE], clientes: [], pedidos: [] };
  if (fonte === "gobeaute") return { produtos: [...cadastrados, ...REAIS_GOBEAUTE], clientes: [], pedidos: [] };
  if (fonte === "b2c") return { produtos: [...cadastrados, ...REAIS_GOBEAUTE_B2C], clientes: [], pedidos: [] };
  const produtos = fonte === "ficticia" ? [...cadastrados, ...ficticios] : [...cadastrados, ...REAIS_GOCASE, ...REAIS_GOBEAUTE, ...REAIS_GOBEAUTE_B2C, ...ficticios];
  return { produtos, clientes: DATA.clientes as never, pedidos: DATA.pedidos as never };
}

function num(v: unknown): number {
  const t = String(v ?? "").trim();
  if (!t) return NaN;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
}

async function reescreverComIA(env: Env, a: ReturnType<typeof analisar>) {
  const growth = a.mensagens.find(m => m.time === "Growth")!;
  const prompt = `Você escreve campanhas da Gocase: tom jovem, curto e direto. Reescreva os três textos abaixo (WhatsApp, e-mail com assunto, SMS de até 140 caracteres) para vender este produto. Mantenha exatamente preços, percentuais e datas. Responda só com JSON no formato {"whatsapp":"...","email":"...","sms":"..."}.\n\nProduto: ${a.produto}\nMotivo: ${a.motivo}\n\n${growth.pronto}`;
  const res = await fetch("https://ai-proxy.gogroupbr.com/v1/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.AI_PROXY_KEY}`, "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env.AI_MODEL || "claude-sonnet-5-5", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
  });
  const body = await res.json() as { content?: { type: string; text?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message || `AI Proxy respondeu ${res.status}`);
  const texto = (body.content ?? []).map(c => c.text ?? "").join("");
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("A IA não devolveu JSON");
  return JSON.parse(m[0]) as { whatsapp: string; email: string; sms: string };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const quem = request.headers.get("x-godeploy-user-email") ?? "anônimo";
    try {
      await setup(env);

      if (url.pathname === "/api/status") {
        return json({ webhook: !!env.CHAT_WEBHOOK_URL, ia: !!env.AI_PROXY_KEY, usuario: quem });
      }

      if (url.pathname === "/api/radar" && request.method === "GET") {
        const t0 = Date.now();
        const pedida = url.searchParams.get("fonte");
        const fonte = pedida === "real" || pedida === "gobeaute" || pedida === "b2c" ? pedida : "ficticia";
        const r = radar(await base(env, fonte));
        return json({ ...r, fonte, info: fonte === "real" ? REAIS_INFO : fonte === "gobeaute" ? REAIS_GOBEAUTE_INFO : fonte === "b2c" ? REAIS_GOBEAUTE_B2C_INFO : "Base fictícia do hackathon.", ms: Date.now() - t0 });
      }

      if (url.pathname === "/api/produtos" && request.method === "POST") {
        const b = await request.json() as Record<string, unknown>;
        const p: Produto = {
          sku: "REAL-" + String(b.produto ?? "").normalize("NFD").replace(/[^\w]+/g, "-").toUpperCase().slice(0, 30),
          produto: String(b.produto ?? "").trim(),
          categoria: String(b.categoria ?? "Copos e garrafas"),
          status: "real",
          estoque_un: num(b.estoque_un), custo_unit_brl: num(b.custo_unit_brl), preco_cheio_brl: num(b.preco_cheio_brl),
          venda_15d_un: num(b.venda_15d_un), venda_15d_anteriores_un: num(b.venda_15d_anteriores_un),
        };
        const positivos = ["estoque_un", "custo_unit_brl", "preco_cheio_brl"];
        const faltando = Object.entries(p)
          .filter(([k, v]) => v === "" || (typeof v === "number" && !(positivos.includes(k) ? v > 0 : v >= 0)))
          .map(([k]) => k);
        if (faltando.length) return json({ erro: `Preencha: ${faltando.join(", ")}` }, 400);
        await env.DB.exec(`INSERT OR REPLACE INTO produtos_reais (sku, dados, criado_por) VALUES (?, ?, ?)`, [p.sku, JSON.stringify(p), quem]);
        return json({ ok: true, analise: analisar(p, await base(env)) });
      }

      if (url.pathname === "/api/produtos" && request.method === "DELETE") {
        const sku = url.searchParams.get("sku") ?? "";
        await env.DB.exec(`DELETE FROM produtos_reais WHERE sku = ?`, [sku]);
        return json({ ok: true });
      }

      if (url.pathname === "/api/enviar" && request.method === "POST") {
        const { sku, times } = await request.json() as { sku: string; times: string[] };
        if (!env.CHAT_WEBHOOK_URL) return json({ erro: "O webhook do Google Chat ainda não foi configurado. Use Copiar por enquanto." }, 400);
        const bs = await base(env);
        const p = bs.produtos.find(x => x.sku === sku);
        if (!p) return json({ erro: "Produto não encontrado" }, 404);
        const a = analisar(p, bs);
        const enviados: { time: string; ok: boolean }[] = [];
        for (const m of a.mensagens.filter(m => times.includes(m.time))) {
          const r = await fetch(env.CHAT_WEBHOOK_URL, {
            method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({ text: textoChat(a, m) }),
          });
          enviados.push({ time: m.time, ok: r.ok });
          await env.DB.exec(`INSERT INTO envios (sku, time, ok, enviado_por) VALUES (?, ?, ?, ?)`, [sku, m.time, r.ok ? 1 : 0, quem]);
        }
        return json({ enviados });
      }

      if (url.pathname === "/api/ia" && request.method === "POST") {
        if (!env.AI_PROXY_KEY) return json({ erro: "A chave do AI Proxy ainda não foi configurada. Os textos do agente continuam valendo." }, 400);
        const { sku } = await request.json() as { sku: string };
        const bs = await base(env);
        const p = bs.produtos.find(x => x.sku === sku);
        if (!p) return json({ erro: "Produto não encontrado" }, 404);
        return json(await reescreverComIA(env, analisar(p, bs)));
      }

      return json({ erro: "Rota não encontrada" }, 404);
    } catch (e) {
      console.log("erro", (e as Error).message);
      return json({ erro: (e as Error).message }, 500);
    }
  },
};
