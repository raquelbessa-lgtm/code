// Inteligência do time Influência: missão de escoamento para afiliadas.
// Funções puras, sem I/O. Os números de INFLUENCIA vêm do Growth MCP (GoCreators) e são um retrato datado:
// confira `coletado_em` antes de decidir. Para atualizar, rode de novo as consultas listadas em `fonte`.
import type { Produto } from "./agente";

export const INFLUENCIA = {
  coletado_em: "2026-10-15",
  periodo: "16/09 a 15/10/2026 (30 dias, dia de hoje parcial)",
  fonte:
    "GoCreators e InfluHub/Inbazz via Growth MCP: affiliate_overview, affiliate_top_products (top 200 produtos), affiliate_roster, affiliate_commission_summary, challenges_performance, challenge_detail, list_afiliado_acoes",
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
  // Bônus de comissão (pontos percentuais acima do tier), dimensionado INTERNAMENTE pela urgência do produto.
  // A afiliada nunca vê o motivo. PREMISSA INICIAL: validar com Influência e Financeiro. Média do programa hoje: ~7,5% da receita de cupom.
  // Referência: o desafio "BATEU A META? COMISSÃO AUMENTA!!" já pagou +3 pp (commission_boost).
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

// Como os desafios de afiliadas rodam hoje (GoCreators, sincronizados como ações no InfluHub/Inbazz).
export const ACOES_HOJE = {
  formato: "um desafio por tier (CLUB, VIP, PREMIUM), meta de postagem em pontos, venda mínima com aumento de comissão, prêmio em produto ou dinheiro",
  metas_de_postagem: { club: 3, vip: 3, premium: 1 }, // "A GARRAFA MAIS LINDA DA GOCASE", 14 a 17/10
  duracao_dias: 4,
  resumo_gocase_01ago_15out: "148 ações no InfluHub (98 de conteúdo, 2 de venda), prêmio quase sempre em dinheiro; várias por produto (bolsa, Mala Trip, tote, garrafa)",
  referencias: [
    "A GARRAFA MAIS LINDA DA GOCASE (Club): 375 inscritas (16,2% da base elegível de ~2.318), 28 atingiram a meta de 3 postagens; prêmio Copo Life",
    "AÇÃO RELÂMPAGO 10/10 (Club): 291 inscritas, 81,8% atingiram a meta de 2 pontos",
    "BATEU A META? COMISSÃO AUMENTA (Premium): venda mínima R$ 1.200, +3 pp de comissão, 17 de 40 concluíram (42,5%)",
  ],
  // Participação é opt-in: só uma parte da base entra, então a ação precisa ser avisada fora da plataforma também.
};

// Produtos que mais saem nas afiliadas por marca (30 dias, GoCreators): usados como prêmio de postagem.
export const MAIS_VENDIDOS: Record<string, string[]> = {
  Gocase: ["Tote Mini - Clear", "Totebag Daily - Clear", "Totebag Daily - Manuscrita"],
  "Rituária": ["Trio de Queridinhos", "Fórmula 4Mag (Magnésio) - 90 dias", "Trio Essencial"],
  "Ápice": ["Hair Balm 100g", "Kit Cachos (5 itens)", "Kit Onduladas Nutri Waves (5 itens)"],
  Barbours: ["Trio Favoritos (Good Graces, Very Sexy e My Sweet Delight)", "Kit Mini Body Splash - Trio Viral 55ml"],
  Lescent: ["Kit Trilogia Essencial Nº 2 + Nº 6 + Nº 10 | 25ml", "Kit Trilogia Essencial Masculina"],
  Kokeshi: ["Kit Hidratação + Colágeno", "Ritual Pele Firme e Olhar Descansado"],
  Denavita: ["Laranja Moro, Picolinato de Cromo e Café Verde (Compre 3 Leve 5)", "Trio de Favoritos"],
};

// Linhas que as afiliadas já vendem (para dimensionar a meta de unidades e o limite do canal).
const REGRAS: { linha: string; rx: RegExp }[] = [
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
];

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const reais2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const maisDias = (d: Date, k: number) => new Date(d.getTime() + k * 86400000);

export function linhaAfiliadas(nome: string) {
  const n = norm(nome);
  const r = REGRAS.find(x => x.rx.test(n));
  return r ? INFLUENCIA.linhas.find(l => l.linha === r.linha) ?? null : null;
}

export type Missao = { oQueFazer: string; porque: string; pronto: string };

// Primeira solução do agente: SEMPRE uma ação para afiliadas, no formato dos desafios do GoCreators
// ("Postou e vendeu? Ganhou!"), para TODAS as afiliadas (Club, VIP e Premium).
// A mensagem às afiliadas não fala de estoque nem de slow moving: elas só recebem a ação.
// O motivo, a margem e o dimensionamento ficam na parte interna.
export function missaoInfluencia(
  p: Produto & { marca?: string },
  precoMin: number,
  motivo: string,
  cobertura: number,
  variacaoPct: number,
  classe: "parado" | "em_risco" | "saudavel" | "campeao",
  saida: boolean,
  hoje: Date = new Date(),
): Missao {
  const marca = p.marca || "Gocase";
  const prog = INFLUENCIA.marcas[marca];
  const propria = linhaAfiliadas(p.produto);

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

  // Meta de venda do produto, em unidades, por tier. Base: média de unidades por afiliada que vende a linha
  // (ex.: Tote Mini Clear = 395 un / 125 afiliadas = 3,2); sem histórico, 3. VIP x1,5 e Premium x3 são premissa a calibrar.
  const baseUn = propria ? Math.max(2, Math.round(propria.un_30d / propria.afiliadas_max)) : 3;
  const meta = { Club: baseUn, VIP: Math.ceil(baseUn * 1.5), Premium: baseUn * 3 } as Record<string, number>;
  const posts = { Club: ACOES_HOJE.metas_de_postagem.club, VIP: ACOES_HOJE.metas_de_postagem.vip, Premium: ACOES_HOJE.metas_de_postagem.premium } as Record<string, number>;

  const inicio = maisDias(hoje, 1), fim = maisDias(hoje, ACOES_HOJE.duracao_dias);
  const prazoTxt = `${ddmm(inicio)} a ${ddmm(fim)}`;
  const tag = norm(p.produto).replace(/[^a-z0-9]/g, "").slice(0, 24);
  const premio = (MAIS_VENDIDOS[marca] ?? []).find(n => !norm(p.produto).split(/\s+/).some(w => w.length > 3 && norm(n).includes(w))) ?? "um produto que sai da marca";
  const nome = urgente && temBonus ? "POSTOU E VENDEU? GANHOU!" : "POSTOU? GANHOU!";

  // ---- parte interna (não vai para as afiliadas)
  const linhasTier = INFLUENCIA.tiers.map(t => {
    const f = faixas.find(x => x.tier === t.tier)!;
    return temBonus && f.bonus > 0
      ? `  ${t.tier.toUpperCase()}: poste ${posts[t.tier]} conteúdo${posts[t.tier] > 1 ? "s" : ""} com #${tag} e venda ${meta[t.tier]} un do produto → comissão de ${t.pct}% para ${t.pct + f.bonus}% nas vendas dele (${brl((liquido * (t.pct + f.bonus)) / 100)}/un)`
      : `  ${t.tier.toUpperCase()}: poste ${posts[t.tier]} conteúdo${posts[t.tier] > 1 ? "s" : ""} com #${tag} (sem aumento de comissão)`;
  }).join("\n");

  const un30 = propria?.un_30d ?? 0;
  const limite = un30 > 0
    ? `Limite do canal: as afiliadas escoam no mínimo ${(p.estoque_un > 0 ? (un30 / p.estoque_un) * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do estoque por mês (${int(un30)} de ${int(p.estoque_un)} un); no ritmo atual seriam ${int(p.estoque_un / un30)} meses. Afiliada acelera, não resolve sozinha: combine com B2B, marketplace e freio de compra.`
    : marca === "Gocase"
      ? `Limite do canal: afiliada acelera, não resolve sozinha. Mesmo se toda a venda de afiliadas da Gocase fosse deste produto, limparia ~8% do estoque parado.`
      : `Limite do canal: afiliada acelera, não resolve sozinha. Só ${prog ? int(prog.vendendo) : "poucas"} afiliadas de ${marca} venderam por cupom em 30 dias; combine com B2B, marketplace e freio de compra.`;

  const alerta: string[] = [];
  if (variacaoPct <= -30) alerta.push(`A venda caiu ${Math.abs(variacaoPct).toLocaleString("pt-BR")}% em 30 dias: confirme com Growth se é demanda ou ruptura antes de pagar bônus.`);
  if (propria && propria.afiliadas_max >= 50 && cobertura > 180) alerta.push(`As afiliadas já vendem bem esta linha e a cobertura continua em ${int(cobertura)} dias: o gargalo é a compra, não a venda. Confira pedidos de compra em aberto.`);
  if (!temBonus && urgente) alerta.push(`Sem espaço para bônus (limite pela margem de ${limiteMargemPct}%, preço mínimo ${brl(precoMin)}): só o prêmio de postagem. Para brinde ou margem baixa, o caminho principal é o brinde inserido por sistema no pedido.`);

  const interno =
    `PARA O TIME (interno, não enviar às afiliadas)\n` +
    `Desafio "${nome} ${p.produto.toUpperCase()}" para todas as afiliadas, ${prazoTxt}, no formato dos desafios do GoCreators (um por tier):\n${linhasTier}\n` +
    `Prêmio de postagem: ${premio} (produto que sai nas afiliadas de ${marca}); confirme o custo com Financeiro antes de lançar.\n` +
    `Preço ao cliente: ${brl(p.preco_cheio_brl)}, sem desconto extra; vale só o cupom padrão da afiliada.\n` +
    (temBonus
      ? `Venda mínima no GoCreators (que mede em R$): Club R$ ${int(meta.Club * liquido)}, VIP R$ ${int(meta.VIP * liquido)}, Premium R$ ${int(meta.Premium * liquido)} (meta de unidades x preço líquido de ${brl(liquido)}).\n`
      : "") +
    (temBonus
      ? `Bônus de comissão: +${alvoPp} pp pela urgência (${motivoBonus}); margem após a maior comissão (${maiorTotalPct}%), antes de frete e imposto: ${brl(liquido * (1 - maiorTotalPct / 100) - p.custo_unit_brl)}/un; limite pela margem ${limiteMargemPct}% (preço mínimo ${brl(precoMin)}). A meta de unidades por tier é premissa a calibrar.\n`
      : "") +
    `Por que este produto (só interno): ${motivo}.\n` +
    `Referência dos desafios que já rodamos: ${ACOES_HOJE.referencias.join("; ")}. A participação é opt-in: avise as afiliadas também fora da plataforma.\n` +
    `Como medir: no GoCreators (challenge_detail), adesão, % que atingiu a meta e efeito em venda; e as unidades do produto vendidas por cupom (affiliate_top_products) contra ${un30 > 0 ? `${int(un30)} un nos 30 dias de hoje` : "zero hoje"}. Cobertura antes: ${int(cobertura)} d.\n` +
    `${limite}` + (alerta.length ? `\nAtenção: ${alerta.join(" ")}` : "");

  // ---- mensagem para as afiliadas: sem estoque, sem slow moving, sem motivo
  const aumentos = temBonus
    ? comBonus.map(f => `${f.tier} de ${f.pct}% para ${f.pct + f.bonus}% (venda ${meta[f.tier]} un)`).join(", ")
    : "";
  const msgAfiliadas =
    `MENSAGEM PARA AS AFILIADAS (pode enviar como está)\n` +
    `${nome} ${p.produto.toUpperCase()}\n` +
    `De ${prazoTxt}.\n` +
    `1) Poste ${posts.Club === posts.VIP ? `${posts.Club} conteúdos (Club e VIP) ou ${posts.Premium} (Premium)` : `${posts.Club} conteúdos`} mostrando o ${p.produto} com a #${tag} e ganhe ${premio}.\n` +
    (temBonus ? `2) Venda o ${p.produto} pelo seu cupom e sua comissão aumenta nas vendas dele: ${aumentos}.\n` : "") +
    `O preço e o seu cupom continuam os de sempre. Entre no desafio na plataforma de afiliadas.`;

  const oQueFazer = urgente && temBonus
    ? `Lance o desafio "Postou e vendeu? Ganhou!" de ${p.produto} para todas as afiliadas (Club, VIP e Premium): comissão extra ao vender a meta de unidades, sem desconto ao cliente`
    : urgente
      ? `Lance o desafio "Postou? Ganhou!" de ${p.produto} para todas as afiliadas, só com prêmio de postagem (sem bônus de comissão)`
      : `Inclua ${p.produto} no próximo desafio "Postou? Ganhou!" das afiliadas, na comissão normal (sem bônus)`;

  const fonte = `Fonte: projeto de afiliados. GoCreators e InfluHub/Inbazz em ${INFLUENCIA.coletado_em} (janela ${INFLUENCIA.periodo}).`;
  const pronto = `${interno}\n${fonte}\n\n${msgAfiliadas}`;
  return { oQueFazer, porque: motivo, pronto };
}
