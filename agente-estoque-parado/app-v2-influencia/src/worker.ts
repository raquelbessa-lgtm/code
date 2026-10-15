// Agente de Estoque Parado: API do agente no GoDeploy.
// GET  /api/radar            radar com parados, entrando em slow moving e a ação de cada time
// POST /api/produtos         cadastra um produto real para o teste (fica no env.DB)
// POST /api/enviar           envia as mensagens escolhidas para o Google Chat (env.CHAT_WEBHOOK_URL)
// POST /api/ia               reescreve os textos de Growth com o AI Proxy (env.AI_PROXY_KEY), se configurado
// GET  /api/linhas           linhas Gocase com estoque no Data Mart (ao vivo, pelo proxy do GoDeploy)
// GET  /api/datamart/linha   estoque, custo, preço, venda 30d/30d anteriores e PO de uma linha, do Data Mart
// GET  /api/acoes            ações para afiliadas já criadas (primeira solução do agente)
// POST /api/acoes            cria a ação para afiliadas de um produto { sku }
// POST /api/acoes/fechar     fecha uma ação { id, nota }
// GET  /api/status           o que está configurado
import { DATA } from "./data";
import { analisar, radar, textoChat, type Base, type Produto } from "./agente";
import { INFLUENCIA } from "./influencia";

type Env = {
  DB: { query: (sql: string, p: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; exec: (sql: string, p: unknown[]) => Promise<unknown> };
  CHAT_WEBHOOK_URL?: string;
  AI_PROXY_KEY?: string;
  AI_MODEL?: string;
  PROXY_BASE_URL?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

async function setup(env: Env) {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS produtos_reais (sku TEXT PRIMARY KEY, dados TEXT NOT NULL, criado_por TEXT, criado_em TEXT DEFAULT (datetime('now')))`, []);
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS acoes (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, produto TEXT, time TEXT DEFAULT 'Influência', oque_fazer TEXT, pronto TEXT, baseline TEXT, status TEXT DEFAULT 'aberta', nota TEXT, criada_por TEXT, criada_em TEXT DEFAULT (datetime('now')), fechada_por TEXT, fechada_em TEXT)`, []);
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS envios (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, time TEXT, ok INTEGER, enviado_por TEXT, enviado_em TEXT DEFAULT (datetime('now')))`, []);
}

async function base(env: Env): Promise<Base> {
  const r = await env.DB.query(`SELECT dados FROM produtos_reais ORDER BY criado_em DESC`, []);
  const reais = r.rows.map(x => JSON.parse(String(x.dados)) as Produto);
  return { produtos: [...reais, ...(DATA.produtos as unknown as Produto[])], clientes: DATA.clientes as never, pedidos: DATA.pedidos as never };
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


// ---- Data Mart ao vivo (PostgREST pelo proxy do GoDeploy, somente leitura, com o login de quem usa o app) ----
async function pg(env: Env, request: Request, path: string): Promise<Record<string, unknown>[]> {
  if (!env.PROXY_BASE_URL) throw new Error("Proxy de dados não configurado neste ambiente.");
  const r = await fetch(`${env.PROXY_BASE_URL}/datamart/${path}`, { headers: { Cookie: request.headers.get("Cookie") ?? "" } });
  if (r.status === 401) throw new Error("Sem login para o Data Mart. Abra o app logado.");
  if (r.status === 403) throw new Error("Você não tem acesso ao Data Mart (peça a permissão de leitura no console do GoDeploy).");
  if (!r.ok) throw new Error(`Data Mart respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return await r.json() as Record<string, unknown>[];
}
async function pgTodas(env: Env, request: Request, path: string, max = 30): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < max; i++) {
    const pagina = await pg(env, request, `${path}&limit=1000&offset=${i * 1000}`);
    out.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return out;
}
const dia = (d: string, k: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
const n0 = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// Estoque do dia 1 do mês da última carga de supply_fluxo_estoque (é o retrato real mais recente da tabela).
async function referenciaEstoque(env: Env, request: Request) {
  const [u] = await pg(env, request, `api.supply_fluxo_estoque?select=loaded_at&order=loaded_at.desc&limit=1`);
  const carregado = String(u?.loaded_at ?? "");
  if (!carregado) throw new Error("Data Mart sem dados em supply_fluxo_estoque.");
  return { ano: Number(carregado.slice(0, 4)), mes: Number(carregado.slice(5, 7)), carregado_em: carregado.slice(0, 10) };
}

async function listarLinhas(env: Env, request: Request) {
  const ref = await referenciaEstoque(env, request);
  const rows = await pg(env, request,
    `api.supply_fluxo_estoque?select=line,item_status,day1_stock,unit_cost,day1_value_brl&year=eq.${ref.ano}&month=eq.${ref.mes}&day1_stock=gt.0&order=day1_value_brl.desc.nullslast&limit=300`);
  return {
    estoque_referencia: `${String(ref.mes).padStart(2, "0")}/${ref.ano} (dia 1), carga de ${ref.carregado_em}`,
    linhas: rows.map(r => ({
      line: String(r.line), situacao: String(r.item_status) === "Descontinuado" ? "descontinuado" : "linha",
      estoque_un: n0(r.day1_stock), custo_unit_brl: n0(r.unit_cost), valor_custo_brl: Math.round(n0(r.day1_value_brl)),
    })),
  };
}

async function dadosDaLinha(env: Env, request: Request, linha: string) {
  const ref = await referenciaEstoque(env, request);
  const q = encodeURIComponent(linha);
  const est = await pg(env, request,
    `api.supply_fluxo_estoque?select=item_status,day1_stock,unit_cost,po_pending&year=eq.${ref.ano}&month=eq.${ref.mes}&line=eq.${q}`);
  if (!est.length) throw new Error(`Linha "${linha}" não encontrada no estoque do Data Mart.`);
  const [ult] = await pg(env, request, `api.supply_sales?select=sale_date&order=sale_date.desc&limit=1`);
  const fim = String(ult?.sale_date ?? "").slice(0, 10);
  if (!fim) throw new Error("Data Mart sem vendas em supply_sales.");
  const ini30 = dia(fim, -29), fimAnt = dia(fim, -30), iniAnt = dia(fim, -59);
  const vendas = await pgTodas(env, request,
    `api.supply_sales?select=sale_date,sales_quantity,invoicing&line=eq.${q}&sale_date=gte.${iniAnt}&sale_date=lte.${fim}&order=id.asc`);
  let q30 = 0, fat30 = 0, qAnt = 0;
  for (const v of vendas) {
    const d = String(v.sale_date).slice(0, 10);
    if (d >= ini30) { q30 += n0(v.sales_quantity); fat30 += n0(v.invoicing); }
    else if (d <= fimAnt) qAnt += n0(v.sales_quantity);
  }
  const estoque = est.reduce((s, r) => s + n0(r.day1_stock), 0);
  const po = est.reduce((s, r) => s + n0(r.po_pending), 0);
  const custo = n0(est[0].unit_cost);
  const defas = Math.round((Date.now() - new Date(fim + "T00:00:00Z").getTime()) / 86400000);
  return {
    linha, situacao: String(est[0].item_status) === "Descontinuado" ? "descontinuado" : "linha",
    estoque_un: estoque, custo_unit_brl: Math.round(custo * 100) / 100,
    preco_medio_brl: q30 > 0 ? Math.round((fat30 / q30) * 100) / 100 : null,
    venda_30d_un: q30, venda_30d_anteriores_un: qAnt, po_pendente_un: po,
    janela: { de: ini30, ate: fim, anterior_de: iniAnt, anterior_ate: fimAnt },
    estoque_referencia: `${String(ref.mes).padStart(2, "0")}/${ref.ano} (dia 1), carga de ${ref.carregado_em}`,
    defasagem_vendas_dias: defas,
    aviso: `Vendas até ${fim.split("-").reverse().join("/")} (${defas} dias atrás). O preço médio é o realizado, já líquido de desconto: use como piso do preço cheio.`,
  };
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const quem = request.headers.get("x-godeploy-user-email") ?? "anônimo";
    try {
      await setup(env);

      if (url.pathname === "/api/status") {
        return json({ webhook: !!env.CHAT_WEBHOOK_URL, ia: !!env.AI_PROXY_KEY, datamart: !!env.PROXY_BASE_URL, usuario: quem });
      }

      if (url.pathname === "/api/radar" && request.method === "GET") {
        const t0 = Date.now();
        const r = radar(await base(env));
        return json({ ...r, ms: Date.now() - t0 });
      }

      if (url.pathname === "/api/acoes" && request.method === "GET") {
        const r = await env.DB.query(`SELECT id, sku, produto, time, oque_fazer, status, nota, baseline, criada_por, criada_em, fechada_em FROM acoes ORDER BY id DESC LIMIT 50`, []);
        return json({ acoes: r.rows.map(x => ({ ...x, baseline: JSON.parse(String(x.baseline || "{}")) })) });
      }

      if (url.pathname === "/api/acoes" && request.method === "POST") {
        const { sku } = await request.json() as { sku: string };
        const bs = await base(env);
        const p = bs.produtos.find(x => x.sku === sku);
        if (!p) return json({ erro: "Produto não encontrado" }, 404);
        const aberta = await env.DB.query(`SELECT id FROM acoes WHERE sku = ? AND status = 'aberta' ORDER BY id DESC LIMIT 1`, [sku]);
        if (aberta.rows.length) return json({ ok: true, id: aberta.rows[0].id, ja_existia: true });
        const a = analisar(p, bs);
        const m = a.mensagens[0]; // primeira solução = afiliadas
        const baseline = JSON.stringify({
          data: new Date().toISOString().slice(0, 10), cobertura_dias: a.coberturaDias, estoque_un: p.estoque_un,
          venda_30d_un: p.venda_media_30d_un, po_pendente_un: p.po_pendente_un ?? 0, valor_estoque_brl: a.valorEstoque,
          fonte: "projeto de afiliados: GoCreators e InfluHub/Inbazz " + INFLUENCIA.coletado_em,
        });
        await env.DB.exec(`INSERT INTO acoes (sku, produto, time, oque_fazer, pronto, baseline, criada_por) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [sku, p.produto, m.time, m.oQueFazer, m.pronto, baseline, quem]);
        const novo = await env.DB.query(`SELECT id FROM acoes WHERE sku = ? ORDER BY id DESC LIMIT 1`, [sku]);
        return json({ ok: true, id: novo.rows[0]?.id, ja_existia: false, oque_fazer: m.oQueFazer });
      }

      if (url.pathname === "/api/acoes/fechar" && request.method === "POST") {
        const { id, nota } = await request.json() as { id: number; nota?: string };
        await env.DB.exec(`UPDATE acoes SET status = 'fechada', nota = ?, fechada_por = ?, fechada_em = datetime('now') WHERE id = ?`, [String(nota ?? "").slice(0, 500), quem, id]);
        return json({ ok: true });
      }

      if (url.pathname === "/api/linhas" && request.method === "GET") {
        return json(await listarLinhas(env, request));
      }

      if (url.pathname === "/api/datamart/linha" && request.method === "GET") {
        const linha = url.searchParams.get("linha") ?? "";
        if (!linha) return json({ erro: "Informe a linha" }, 400);
        return json(await dadosDaLinha(env, request, linha));
      }

      if (url.pathname === "/api/influencia" && request.method === "GET") {
        return json(INFLUENCIA);
      }

      if (url.pathname === "/api/produtos" && request.method === "POST") {
        const b = await request.json() as Record<string, unknown>;
        const p: Produto = {
          sku: "REAL-" + String(b.produto ?? "").normalize("NFD").replace(/[^\w]+/g, "-").toUpperCase().slice(0, 30),
          produto: String(b.produto ?? "").trim(),
          categoria: String(b.categoria ?? "Copos e garrafas"),
          status: "real",
          estoque_un: num(b.estoque_un), custo_unit_brl: num(b.custo_unit_brl), preco_cheio_brl: num(b.preco_cheio_brl),
          venda_media_30d_un: num(b.venda_media_30d_un), venda_30d_anteriores_un: num(b.venda_30d_anteriores_un),
        };
        const positivos = ["estoque_un", "custo_unit_brl", "preco_cheio_brl"];
        const faltando = Object.entries(p)
          .filter(([k, v]) => v === "" || (typeof v === "number" && !(positivos.includes(k) ? v > 0 : v >= 0)))
          .map(([k]) => k);
        if (faltando.length) return json({ erro: `Preencha: ${faltando.join(", ")}` }, 400);
        const marca = String(b.marca ?? "Gocase");
        p.marca = marca === "Gocase" || marca in INFLUENCIA.marcas ? marca : "Gocase";
        p.situacao = b.situacao === "descontinuado" ? "descontinuado" : "linha";
        const po = num(b.po_pendente_un);
        if (Number.isFinite(po) && po > 0) p.po_pendente_un = po;
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
