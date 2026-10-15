#!/usr/bin/env python3
"""Gera app/src/contatos_torre.ts a partir do resultado JSON de contatos/torre_contatos.sql (Torre B2B, query_sql).
Uso: python3 contatos/gerar_contatos_torre.py resultado.json
O arquivo gerado tem telefone e e-mail de clientes: está no .gitignore e NÃO deve ser commitado."""
import json, sys, re, datetime
rows = json.load(open(sys.argv[1]))
rows = rows[0]["j"] if isinstance(rows[0], dict) and "j" in rows[0] else rows
FISCAL = re.compile(r"^(nf|nfe|fiscal|financeiro|areafiscal|contabil|receb)", re.I)
por = {}
for r in rows: por.setdefault((r["n"], r["uf"]), []).append(r)
out = {}
for (n, uf), rs in por.items():
    chave = f"{n}|{uf}"
    if len(rs) > 1 or rs[0]["k"] > 1:
        out[chave] = {"motivo": f"há {rs[0]['k']} cadastros (filiais) com esse nome na Torre: confirme qual loja é antes de enviar"}; continue
    r = rs[0]
    d = {}
    if r.get("wa"): d["telefone"] = r["wa"]
    elif r.get("tm") and re.sub(r"\D", "", r["tm"]).__len__() >= 10: d["telefone"] = re.sub(r"\D", "", r["tm"])
    if r.get("em"):
        d["email"] = r["em"].lower(); d["emailFonte"] = r["ef"]
        if FISCAL.match(r["em"]): d["emailAviso"] = "e-mail de área fiscal/financeira, não do comprador"
    if not d: d = {"motivo": "cliente sem telefone nem e-mail cadastrados na Torre"}
    out[chave] = d
# e-mail repetido em clientes diferentes = caixa compartilhada
cont = {}
for v in out.values():
    if v.get("email"): cont[v["email"]] = cont.get(v["email"], 0) + 1
for v in out.values():
    if v.get("email") and cont[v["email"]] > 1: v["emailAviso"] = f"mesmo e-mail em {cont[v['email']]} clientes (caixa compartilhada)"
hoje = datetime.date.today().strftime("%d/%m/%Y")
open("app/src/contatos_torre.ts", "w").write(
    "// GERADO por contatos/gerar_contatos_torre.py. Contém dados pessoais de clientes: NÃO commitar (está no .gitignore).\n"
    f"export const TORRE_GERADO_EM = \"{hoje}\";\n"
    "export type ContatoTorre = { telefone?: string; email?: string; emailFonte?: string; emailAviso?: string; motivo?: string };\n"
    "export const TORRE: Record<string, ContatoTorre> = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
print(len(out), "clientes;", sum(1 for v in out.values() if v.get("telefone")), "com telefone;", sum(1 for v in out.values() if v.get("email")), "com e-mail;", sum(1 for v in out.values() if v.get("motivo")), "sem contato")
