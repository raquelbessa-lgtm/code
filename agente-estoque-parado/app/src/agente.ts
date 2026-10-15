// Lógica do Agente de Estoque Parado: radar, oferta com margem e uma mensagem pronta por time.
// Funções puras, sem I/O, para rodar igual no GoDeploy e no teste local.
import { missaoInfluencia } from "./influencia";

export type Produto = {
  sku: string;
  produto: string;
  categoria: string;
  status: string; // slow moving | descontinuado | dead stock | ativo | campeão | real
  estoque_un: number;
  custo_unit_brl: number;
  preco_cheio_brl: number;
  venda_media_30d_un: number;
  venda_30d_anteriores_un: number;
  marca?: string; // Gocase (padrão), Barbours, Lescent... usada pelo bloco de Influência
  situacao?: string; // "descontinuado" marca saída mesmo em produto real
  po_pendente_un?: number; // pedido de compra em aberto (un), vindo do Data Mart
};
export type Cliente = {
  cliente_id: string;
  canal_preferido: string;
  recorrente: string;
  dias_desde_ultima_compra: number;
  aceita_marketing: string;
  qtd_pedidos: number;
  ticket_medio_brl: number;
};
export type Pedido = { cliente_id: string; sku: string };
export type Base = { produtos: Produto[]; clientes: Cliente[]; pedidos: Pedido[] };

export type Classe = "parado" | "em_risco" | "saudavel" | "campeao";

export type Mensagem = {
  time: string;
  oQueFazer: string;
  porque: string;
  ateQuando: string;
  pronto: string;
};

export type Analise = {
  sku: string;
  produto: string;
  categoria: string;
  classe: Classe;
  status: string;
  coberturaDias: number;
  variacaoVendaPct: number;
  valorEstoque: number;
  motivo: string;
  precoMinimo: number;
  oferta: { tipo: string; descricao: string; preco: number; descontoPct: number; campeao?: string };
  publico: { total: number; porCanal: Record<string, number>; criterio: string; amostra: string[] };
  mensagens: Mensagem[];
};

const PARADOS = new Set(["slow moving", "descontinuado", "dead stock"]);
export const MARGEM_MINIMA = 1.8; // preço mínimo = custo x 1,8 (folga para frete, imposto e mídia)

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const arred5 = (pct: number) => Math.floor(pct / 5) * 5;

export function cobertura(p: Produto): number {
  return p.venda_media_30d_un > 0 ? Math.round((p.estoque_un / p.venda_media_30d_un) * 30) : 9999;
}
export function variacao(p: Produto): number {
  return p.venda_30d_anteriores_un > 0 ? Math.round((p.venda_media_30d_un / p.venda_30d_anteriores_un - 1) * 1000) / 10 : 0;
}

export function classificar(p: Produto): Classe {
  if (p.status === "campeão") return "campeao";
  const cob = cobertura(p), v = variacao(p);
  if (PARADOS.has(p.status) || p.situacao === "descontinuado" || cob > 180) return "parado";
  if (v <= -30 && cob > 90) return "em_risco";
  return "saudavel";
}

function prazo(hoje: Date, dias: number): string {
  const d = new Date(hoje.getTime() + dias * 86400000);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function campeaoRelacionado(p: Produto, base: Base): Produto | undefined {
  const camp = base.produtos.filter(x => x.status === "campeão");
  return camp.find(x => x.categoria === p.categoria) ?? camp.sort((a, b) => b.venda_media_30d_un - a.venda_media_30d_un)[0];
}

function publico(p: Produto, camp: Produto | undefined, base: Base) {
  const cat = new Map(base.produtos.map(x => [x.sku, x.categoria]));
  const alvo = new Set<string>();
  for (const ped of base.pedidos) {
    if (cat.get(ped.sku) === p.categoria || (camp && ped.sku === camp.sku)) alvo.add(ped.cliente_id);
  }
  const escolhidos = base.clientes
    .filter(c => alvo.has(c.cliente_id) && c.aceita_marketing === "sim" && c.dias_desde_ultima_compra <= 365)
    .sort((a, b) => (a.recorrente === b.recorrente ? a.dias_desde_ultima_compra - b.dias_desde_ultima_compra : a.recorrente === "sim" ? -1 : 1));
  const porCanal: Record<string, number> = {};
  for (const c of escolhidos) porCanal[c.canal_preferido] = (porCanal[c.canal_preferido] ?? 0) + 1;
  return {
    total: escolhidos.length,
    porCanal,
    criterio: `compraram ${p.categoria.toLowerCase()}${camp ? " ou " + camp.produto : ""} no último ano e aceitam marketing; recorrentes primeiro`,
    amostra: escolhidos.slice(0, 8).map(c => c.cliente_id),
  };
}

export function analisar(p: Produto, base: Base, hoje = new Date()): Analise {
  const classe = classificar(p);
  const cob = cobertura(p), v = variacao(p);
  const precoMin = Math.round(p.custo_unit_brl * MARGEM_MINIMA * 100) / 100;
  const camp = campeaoRelacionado(p, base);
  const real = p.status === "real";
  const pub = real
    ? { total: 0, porCanal: {} as Record<string, number>, criterio: `clientes reais que compraram ${p.categoria.toLowerCase()} no último ano e aceitam marketing; recorrentes primeiro`, amostra: [] as string[] }
    : publico(p, camp, base);
  const quem = pub.total > 0 ? `${pub.total} clientes` : "o público do critério abaixo";
  const parado = classe === "parado";
  const saida = p.status === "descontinuado" || p.status === "dead stock" || p.situacao === "descontinuado";

  // Oferta: desconto até o preço mínimo (teto de 40% parado, 15% em risco). Desconto baixo vira kit com campeão.
  const teto = parado ? 40 : 15;
  const espaco = arred5((1 - precoMin / p.preco_cheio_brl) * 100);
  const desc = Math.max(0, Math.min(teto, espaco));
  let oferta: Analise["oferta"];
  if (desc >= 10) {
    const preco = Math.round(p.preco_cheio_brl * (1 - desc / 100) * 100) / 100;
    oferta = { tipo: "desconto", descricao: `${p.produto} de ${brl(p.preco_cheio_brl)} por ${brl(preco)} (${desc}% off)`, preco, descontoPct: desc };
  } else {
    const preco = Math.max(precoMin, Math.round(p.preco_cheio_brl * 0.9 * 100) / 100);
    oferta = { tipo: "kit", descricao: `Na compra de ${camp?.produto ?? "um campeão"}, leve ${p.produto} por ${brl(preco)}`, preco, descontoPct: Math.round((1 - preco / p.preco_cheio_brl) * 100), campeao: camp?.produto };
  }

  const motivo = parado
    ? `${int(cob)} dias de estoque`
    : classe === "em_risco"
      ? `venda caiu ${Math.abs(v).toLocaleString("pt-BR")}% em 30 dias`
      : `${int(cob)} dias de estoque, venda estável`;
  const ate = prazo(hoje, parado ? 7 : 14);
  const canais = Object.entries(pub.porCanal).map(([c, n]) => `${c} ${n}`).join(", ") || "nenhum";

  const loteUn = Math.max(50, Math.round((p.estoque_un * (saida ? 0.4 : 0.2)) / 10) * 10);
  const precoLote = Math.max(precoMin, Math.round(p.preco_cheio_brl * 0.5 * 100) / 100);
  const precoMkt = Math.round(precoMin * 1.15 * 100) / 100;

  // Box surpresa: clientes fiéis assinam e ganham o produto parado de surpresa; quem acabou de comprar recebe o convite.
  const fieis = real ? [] : base.clientes.filter(c => c.recorrente === "sim" && c.qtd_pedidos >= 3 && c.aceita_marketing === "sim");
  const novos = real ? [] : base.clientes.filter(c => c.qtd_pedidos === 1 && c.dias_desde_ultima_compra <= 30 && c.aceita_marketing === "sim");
  const ticketFiel = fieis.length ? fieis.reduce((s, c) => s + c.ticket_medio_brl, 0) / fieis.length : 149.9;
  const faixas = [99.9, 149.9, 199.9, 249.9];
  const box = faixas.find(f => f >= ticketFiel && p.custo_unit_brl <= f * 0.25) ?? faixas.find(f => p.custo_unit_brl <= f * 0.25) ?? 249.9;
  const brindeOk = p.custo_unit_brl <= box * 0.25;
  const fieisTxt = real ? "os clientes fiéis da base real (3 ou mais pedidos)" : `${fieis.length} clientes fiéis`;
  const novosTxt = real || !novos.length
    ? "quem fizer a primeira compra a partir de hoje"
    : `${novos.length} clientes que compraram pela primeira vez nos últimos 30 dias`;

  // Influência: missão de escoamento para afiliadas, com comissão extra limitada pela margem (nunca desconto ao cliente).
  const missao = missaoInfluencia(p, precoMin, motivo, cob, v, classe, saida);

  const textoWhats =`Oi! Separamos uma oferta pra você: ${oferta.descricao}. Vale até ${ate} ou enquanto durar o estoque.`;
  const textoEmail = `Assunto: ${oferta.tipo === "kit" ? "Seu kit com preço especial" : "Preço especial só para clientes Gocase"}\n${oferta.descricao}. Válido até ${ate}.`;
  const textoSms = `Gocase: ${oferta.descricao}. Até ${ate}.`;

  const mensagens: Mensagem[] = [
    {
      time: "Growth",
      oQueFazer: parado ? `Lance a oferta para ${quem}` : `Destaque o produto e lance a oferta leve para ${quem}`,
      porque: motivo,
      ateQuando: ate,
      pronto: `Oferta: ${oferta.descricao}\n\nWhatsApp: ${textoWhats}\n\nE-mail: ${textoEmail}\n\nSMS: ${textoSms}`,
    },
    {
      time: "CRM",
      oQueFazer: `Dispare a campanha de Growth para ${quem}`,
      porque: motivo,
      ateQuando: ate,
      pronto: real
        ? `Público: ${pub.criterio}. Montar a lista na base real do CRM.`
        : `Público: ${pub.criterio}.\nPor canal: ${canais}.\nPrimeiros da lista (fictícios): ${pub.amostra.join(", ")}`,
    },
    {
      time: "CRM: Box surpresa",
      oQueFazer: brindeOk
        ? `Ofereça a Box surpresa de ${brl(box)}/mês para ${fieisTxt}`
        : `Use o produto como item principal da Box de ${brl(box)}/mês para ${fieisTxt}`,
      porque: motivo,
      ateQuando: ate,
      pronto: `Box: assine a Box Gocase de ${brl(box)}/mês e ganhe ${brindeOk ? `${p.produto} de surpresa` : `${p.produto} na primeira caixa`}.\n` +
        `Custo do item: ${brl(p.custo_unit_brl)} (${Math.round((p.custo_unit_brl / box) * 100)}% do valor da box).\n` +
        `Fiéis: ${fieisTxt}, ticket médio ${brl(ticketFiel)}.\n` +
        `Pós-compra: ${novosTxt} recebem o convite "assine e ganhe uma surpresa" no e-mail de confirmação do pedido.\n` +
        `Atenção: conferir o item da box na expedição. Brinde faltando é o maior motivo de reembolso do ano.`,
    },
    {
      time: "Influência",
      oQueFazer: missao.oQueFazer,
      porque: missao.porque,
      ateQuando: ate,
      pronto: missao.pronto,
    },
    {
      time: "B2B",
      oQueFazer: `Ofereça um lote de ${int(loteUn)} unidades a ${brl(precoLote)} cada`,
      porque: motivo,
      ateQuando: ate,
      pronto: `Proposta: ${int(loteUn)} un de ${p.produto} a ${brl(precoLote)}/un (total ${brl(loteUn * precoLote)}). Preço mínimo com margem: ${brl(precoMin)}. Não fechar abaixo disso.`,
    },
    {
      time: "Marketplaces",
      oQueFazer: `Publique o anúncio com preço a partir de ${brl(precoMkt)}`,
      porque: motivo,
      ateQuando: ate,
      pronto: `Título: ${p.produto} | Original Gocase\nDescrição: ${p.produto}, da linha ${p.categoria.toLowerCase()}. Estoque a pronta entrega.\nPreço mínimo por canal: ${brl(precoMkt)} (já cobre comissão).`,
    },
    {
      time: "Produto e Compras",
      oQueFazer: saida ? "Monte o plano de saída e não recompre" : parado ? "Não recompre até a cobertura cair abaixo de 90 dias" : "Pause a próxima compra e revise em 2 semanas",
      porque: motivo,
      ateQuando: ate,
      pronto: `${p.produto}: ${int(p.estoque_un)} un em estoque (${brl(p.estoque_un * p.custo_unit_brl)} a custo), ${int(cob)} dias de cobertura, venda ${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR")}% contra os 30 dias anteriores.` +
        (p.po_pendente_un && p.po_pendente_un > 0
          ? `\nPedido de compra em aberto: ${int(p.po_pendente_un)} un (${brl(p.po_pendente_un * p.custo_unit_brl)} a custo). Com ele a cobertura iria para ${int(p.venda_media_30d_un > 0 ? ((p.estoque_un + p.po_pendente_un) / p.venda_media_30d_un) * 30 : 9999)} dias. ${cob > 90 ? "Peça para adiar ou cancelar antes de chegar." : "Cobertura ainda saudável sem o pedido."}`
          : ""),
    },
  ];

  return {
    sku: p.sku, produto: p.produto, categoria: p.categoria, classe, status: p.status,
    coberturaDias: cob, variacaoVendaPct: v, valorEstoque: Math.round(p.estoque_un * p.custo_unit_brl),
    motivo, precoMinimo: precoMin, oferta, publico: pub, mensagens,
  };
}

export function radar(base: Base, hoje = new Date()) {
  const todos = base.produtos.map(p => analisar(p, base, hoje)).sort((a, b) => b.valorEstoque - a.valorEstoque);
  return {
    reais: todos.filter(a => a.status === "real"),
    parados: todos.filter(a => a.classe === "parado" && a.status !== "real"),
    emRisco: todos.filter(a => a.classe === "em_risco" && a.status !== "real"),
    saudaveis: todos.filter(a => a.classe === "saudavel").map(a => a.produto),
  };
}

export function textoChat(a: Analise, m: Mensagem): string {
  return `*Agente de Estoque Parado → ${m.time}*\n*O que fazer:* ${m.oQueFazer}\n*Por quê:* ${a.produto}, ${m.porque}\n*Até quando:* ${m.ateQuando}\n*Pronto para usar:*\n${m.pronto}\n\nResponda *ok* para aprovar.`;
}
