// Inteligência do time Influência: missão de escoamento para afiliadas.
// Funções puras, sem I/O. Os números de INFLUENCIA vêm do Growth MCP (GoCreators) e são um retrato datado:
// confira `coletado_em` antes de decidir. Para atualizar, rode de novo as consultas listadas em `fonte`.
import type { Produto } from "./agente";

export const INFLUENCIA = {
  coletado_em: "2026-10-15",
  periodo: "16/09 a 15/10/2026 (30 dias, dia de hoje parcial)",
  fonte:
    "GoCreators via Growth MCP: affiliate_overview, affiliate_top_products (top 200 produtos), affiliate_roster, affiliate_commission_summary",
  // % de comissão por tier (tabela embaixador_tiers, segundo affiliate_commission_summary)
  tiers: [
    { tier: "Club", pct: 5, afiliadas: 4303 },
    { tier: "VIP", pct: 8, afiliadas: 150 },
    { tier: "Premium", pct: 10, afiliadas: 107 },
  ],
  // Desconto médio da Gocase em ago/26: R$ 6,3 mi = 11,5% do valor dos itens (briefing do Tema 1).
  // Usado só como proxy do desconto do cupom padrão da afiliada ao calcular o teto de comissão.
  desconto_cupom_padrao_pct: 11.5,
  total: { pessoas_ativas: 4443, pessoas_vendendo_cupom: 1286, receita_cupom_30d: 2871255 },
  // Programa por marca (affiliate_overview, por_marca). Marca fora da lista não tem ingestão de afiliadas.
  marcas: {
    Gocase: { ativas: 2317, vendendo: 777, receita: 1851289, ticket: 217.01 },
    "Rituária": { ativas: 895, vendendo: 164, receita: 488424, ticket: 156.4 },
    "Ápice": { ativas: 1258, vendendo: 230, receita: 229281, ticket: 146.13 },
    Barbours: { ativas: 1152, vendendo: 77, receita: 90647, ticket: 114.74 },
    Lescent: { ativas: 690, vendendo: 50, receita: 83132, ticket: 119.44 },
    Kokeshi: { ativas: 1061, vendendo: 124, receita: 70195, ticket: 86.13 },
    Denavita: { ativas: 654, vendendo: 74, receita: 58288, ticket: 183.29 },
  } as Record<string, { ativas: number; vendendo: number; receita: number; ticket: number }>,
  // Concentração na Gocase: as 5 maiores afiliadas (todas Premium ou Club) somaram R$ 539 mil de R$ 1,85 mi.
  // Bônus extra de comissão (pontos percentuais acima do tier) por urgência. PREMISSA INICIAL para testar:
  // validar com Influência e Financeiro. A média estimada do programa hoje é ~7,5% da receita de cupom.
  bonus_pp: { critico: 5, parado: 3, risco: 2 },
  concentracao_gocase_top5_pct: 29,
  comissao_media_estimada_pct: 7.5,
  // O que as afiliadas da Gocase vendem hoje, por linha (soma das estampas que aparecem no top 200 de 30 dias).
  // É um piso: estampa fora do top 200 não entra. `afiliadas_max` = afiliadas da estampa mais forte da linha.
  linhas: [
    { linha: "Mini Tote", un_30d: 656, afiliadas_max: 125 },
    { linha: "Tote Bag Daily", un_30d: 599, afiliadas_max: 103 },
    { linha: "Garrafa Fresh", un_30d: 727, afiliadas_max: 85 },
    { linha: "Bolsa Moove", un_30d: 590, afiliadas_max: 87 },
    { linha: "Bolsa Joy", un_30d: 349, afiliadas_max: 57 },
    { linha: "Garrafa Flip Pro", un_30d: 248, afiliadas_max: 57 },
    { linha: "Tote Puff", un_30d: 153, afiliadas_max: 47 },
    { linha: "Mala Trip", un_30d: 172, afiliadas_max: 32 },
    { linha: "Tote Moon Puffer", un_30d: 158, afiliadas_max: 50 },
    { linha: "Tote Pop", un_30d: 97, afiliadas_max: 42 },
    { linha: "Garrafa Urban", un_30d: 478, afiliadas_max: 38 },
    { linha: "Bolsa Essential", un_30d: 102, afiliadas_max: 36 },
    { linha: "Mochila Voyage", un_30d: 45, afiliadas_max: 19 },
    { linha: "Copo Life", un_30d: 181, afiliadas_max: 35 },
    { linha: "Necessaire", un_30d: 290, afiliadas_max: 48 },
    { linha: "Lancheira", un_30d: 150, afiliadas_max: 31 },
    { linha: "Garrafa Mini", un_30d: 32, afiliadas_max: 23 },
  ],
};

// Como achar a linha no nome que a pessoa digitou. `vizinha` = linha parecida que as afiliadas já vendem,
// usada para convidar quem tem público para este tipo de produto quando a própria linha não aparece.
const REGRAS: { linha: string; rx: RegExp; vizinha?: string }[] = [
  { linha: "Mini Tote", rx: /mini tote|tote mini/ },
  { linha: "Tote Bag Daily", rx: /tote ?(bag)? daily/ },
  { linha: "Tote Moon Puffer", rx: /tote moon/ },
  { linha: "Tote Puff", rx: /tote puff/ },
  { linha: "Tote Pop", rx: /tote pop/ },
  { linha: "Bolsa Moove", rx: /bolsa moove/ },
  { linha: "Bolsa Joy", rx: /bolsa joy/ },
  { linha: "Bolsa Essential", rx: /bolsa essential/ },
  { linha: "Garrafa Flip Pro", rx: /flip pro/ },
  { linha: "Garrafa Fresh", rx: /fresh/ },
  { linha: "Garrafa Urban", rx: /urban/ },
  { linha: "Garrafa Mini", rx: /garrafa mini/ },
  { linha: "Copo Life", rx: /copo life/ },
  { linha: "Mala Trip", rx: /mala.*trip|trip.*mala/ },
  { linha: "Mochila Voyage", rx: /mochila voyage/ },
  { linha: "Necessaire", rx: /necessaire(?!.*(hologr|clean|basica|trip))/ },
  { linha: "Lancheira", rx: /lancheira/ },
  // sem venda de afiliada hoje: aponta para a linha vizinha
  { linha: "", rx: /copo vibe|vibe/, vizinha: "Copo Life" },
  { linha: "", rx: /garrafa magsafe|magsafe/, vizinha: "Garrafa Urban" },
  { linha: "", rx: /mochila (fun|bts)|mochila rodinha/, vizinha: "Mochila Voyage" },
];

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

export function linhaAfiliadas(nome: string) {
  const n = norm(nome);
  for (const r of REGRAS) {
    if (!r.rx.test(n)) continue;
    if (r.linha) return { propria: INFLUENCIA.linhas.find(l => l.linha === r.linha) ?? null, vizinha: null };
    return { propria: null, vizinha: INFLUENCIA.linhas.find(l => l.linha === r.vizinha) ?? null };
  }
  return { propria: null, vizinha: null };
}

export type Missao = { oQueFazer: string; porque: string; pronto: string };

export function missaoInfluencia(
  p: Produto & { marca?: string },
  precoMin: number,
  motivo: string,
  cobertura: number,
  variacaoPct: number,
  classe: "parado" | "em_risco" | "saudavel" | "campeao",
  saida: boolean,
): Missao {
  const marca = p.marca || "Gocase";
  const prog = INFLUENCIA.marcas[marca];
  const { propria, vizinha } = linhaAfiliadas(p.produto);

  // Só há missão com bônus quando existe urgência de escoar (parado ou entrando em slow moving).
  const urgente = classe === "parado" || classe === "em_risco";
  // Limite pela margem: o que sobra do preço (já sem o desconto do cupom padrão) acima do preço mínimo.
  const liquido = p.preco_cheio_brl * (1 - INFLUENCIA.desconto_cupom_padrao_pct / 100);
  const limiteMargemPct = Math.max(0, Math.floor(((liquido - precoMin) / liquido) * 100));
  const alvoPp = !urgente ? 0
    : saida || cobertura > 365 ? INFLUENCIA.bonus_pp.critico
    : classe === "parado" ? INFLUENCIA.bonus_pp.parado
    : INFLUENCIA.bonus_pp.risco;
  const faixas = INFLUENCIA.tiers.map(t => ({ ...t, bonus: Math.max(0, Math.min(alvoPp, limiteMargemPct - t.pct)) }));
  const comBonus = faixas.filter(f => f.bonus > 0);
  const temBonus = comBonus.length > 0;
  const maiorTotalPct = temBonus ? Math.max(...comBonus.map(f => f.pct + f.bonus)) : 0;
  const motivoBonus = saida ? "saída" : cobertura > 365 ? "cobertura acima de 365 dias" : classe === "parado" ? "parado" : "venda caindo";

  // Quanto o canal afiliado escoa por mês (piso) e quanto isso pesa no estoque.
  const un30 = propria?.un_30d ?? 0;
  const escoaPct = p.estoque_un > 0 ? (un30 / p.estoque_un) * 100 : 0;
  const mesesNoRitmo = un30 > 0 ? p.estoque_un / un30 : 0;

  const marcaTxt = prog
    ? `${marca}: ${int(prog.vendendo)} de ${int(prog.ativas)} afiliadas venderam por cupom em 30 dias (${Math.round((prog.vendendo / prog.ativas) * 100)}%), ticket ${brl(prog.ticket)}.`
    : `${marca} não tem programa de afiliadas com dado no GoCreators; use seeding e macros.`;
  const rodape = `Dados do programa: GoCreators em ${INFLUENCIA.coletado_em}, janela ${INFLUENCIA.periodo}.`;

  // 1) sem urgência: não paga bônus
  if (!urgente) {
    return {
      oQueFazer: `Não pague bônus por ${p.produto}: não há urgência de escoamento. Deixe as afiliadas na comissão normal do tier`,
      porque: motivo,
      pronto: `Sem missão de escoamento: ${p.produto} está com cobertura saudável (${int(cobertura)} dias).\n` +
        `Comissão normal: Club 5%, VIP 8%, Premium 10%. Bônus extra só quando o produto passar de 180 dias de cobertura ou a venda cair 30% ou mais.\n${rodape}`,
    };
  }

  // 2) sem margem: não paga bônus
  if (!temBonus) {
    return {
      oQueFazer: `Não abra missão com bônus: a margem de ${p.produto} não comporta comissão extra. Use seeding do estoque parado`,
      porque: motivo,
      pronto: `Sem bônus para ${p.produto}: o limite pela margem é ${limiteMargemPct}% de comissão total (preço mínimo ${brl(precoMin)} contra preço líquido de ${brl(liquido)}), abaixo do menor tier (5%).\n` +
        `Para itens de brinde ou margem baixa o caminho é brinde inserido por sistema no pedido, não afiliada.\n` +
        `Seeding: envie o produto parado para 20 creators (R$ ${(p.custo_unit_brl * 20).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a custo, sem compra nova).\n${rodape}`,
    };
  }

  // 3) missão com bônus
  let oQueFazer: string;
  let quem: string;
  if (propria) {
    oQueFazer = `Abra uma missão de escoamento de ${p.produto} para as afiliadas que já vendem ${propria.linha} (comissão extra, sem desconto ao cliente)`;
    quem = `Convide primeiro quem já vende ${propria.linha}: até ${propria.afiliadas_max} afiliadas numa mesma estampa, ${int(propria.un_30d)} un em 30 dias (piso, top 200). Depois as Premium e VIP que venderam nos últimos 30 dias.`;
  } else if (vizinha) {
    oQueFazer = `Descubra ${p.produto} com afiliadas: nenhuma vende esta linha hoje. Missão com seeding e comissão extra (sem desconto ao cliente) para quem vende ${vizinha.linha}`;
    quem = `Nenhuma afiliada vende esta linha hoje (fora do top 200 de produtos). Comece por quem vende ${vizinha.linha} (${int(vizinha.un_30d)} un em 30 dias, até ${vizinha.afiliadas_max} afiliadas numa estampa) e mande seeding para testar.`;
  } else {
    oQueFazer = `Abra uma missão de escoamento de ${p.produto} para afiliadas Premium e VIP (comissão extra, sem desconto ao cliente)`;
    quem = `Sem histórico desta linha entre as afiliadas. Comece pelas Premium (${INFLUENCIA.tiers[2].afiliadas}) e VIP (${INFLUENCIA.tiers[1].afiliadas}) que venderam nos últimos 30 dias: poucas concentram a venda (as 5 maiores da Gocase fazem ${INFLUENCIA.concentracao_gocase_top5_pct}% da receita de cupom).`;
  }

  const tabela =
    `Bônus por unidade vendida, sem mexer no preço do cliente:\n` +
    comBonus.map(f => `  ${f.tier}: ${f.pct}% + ${f.bonus} pp = ${f.pct + f.bonus}% (${brl((liquido * (f.pct + f.bonus)) / 100)}/un)`).join("\n") +
    `\nBônus de ${alvoPp} pp pela urgência (${motivoBonus}). Comece testando só um tier. Margem após a maior comissão (${maiorTotalPct}%), antes de frete e imposto: ${brl(liquido * (1 - maiorTotalPct / 100) - p.custo_unit_brl)}/un. Limite pela margem: ${limiteMargemPct}% (preço mínimo ${brl(precoMin)}).`;

  const limite = un30 > 0
    ? `Limite do canal: as afiliadas escoam no mínimo ${escoaPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do estoque por mês (${int(un30)} de ${int(p.estoque_un)} un). No ritmo atual seriam ${int(mesesNoRitmo)} meses; mesmo triplicando, afiliada acelera mas não resolve sozinha. Combine com B2B, marketplace e freio de compra.`
    : `Limite do canal: afiliada acelera, não resolve sozinha. Mesmo se toda a venda de afiliadas da Gocase fosse deste produto, limparia ~8% do estoque parado.`;

  const alerta: string[] = [];
  if (variacaoPct <= -30) alerta.push(`A venda caiu ${Math.abs(variacaoPct).toLocaleString("pt-BR")}% em 30 dias: confirme com Growth se é demanda ou ruptura antes de pagar bônus.`);
  if (propria && propria.afiliadas_max >= 50 && cobertura > 180) alerta.push(`As afiliadas já vendem bem esta linha e a cobertura continua em ${int(cobertura)} dias: o gargalo é a compra, não a venda. Confira pedidos de compra em aberto.`);

  const pronto =
    `Missão de escoamento: ${p.produto}\n` +
    `Preço ao cliente: ${brl(p.preco_cheio_brl)} (sem desconto extra; vale só o cupom padrão da afiliada).\n` +
    `${tabela}\n\n` +
    `Quem convidar: ${quem}\n${marcaTxt}\n\n` +
    `Seeding: em vez de comprar estoque novo, envie o produto parado para 20 creators (R$ ${(p.custo_unit_brl * 20).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a custo, sem compra nova).\n` +
    `Roteiro em 3 falas: mostrar o produto em uso; dizer que a missão vale por tempo limitado; chamar para o link da afiliada.\n\n` +
    `Como medir: unidades do produto vendidas por cupom em 14 dias (affiliate_top_products) ${un30 > 0 ? `contra os ${int(un30)} un de hoje (30 dias)` : "contra zero venda por cupom hoje"}, cobertura antes (${int(cobertura)} d) e depois, e comissão total paga de no máximo ${maiorTotalPct}%.\n` +
    `${limite}` +
    (alerta.length ? `\nAtenção: ${alerta.join(" ")}` : "") +
    `\n${rodape}`;

  const porque = propria
    ? `${motivo}; afiliadas já vendem a linha (${int(propria.un_30d)} un em 30 dias)`
    : vizinha
      ? `${motivo}; nenhuma afiliada vende esta linha hoje`
      : motivo;

  return { oQueFazer, porque, pronto };
}
