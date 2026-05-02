# Seu Engenheiro AI

Agente de engenharia elétrica via WhatsApp. Stack: Node.js + OpenAI gpt-5-mini + Supabase (pgvector) + Z-API + Vercel.

---

## 🧪 Suíte de Regressão

Bateria de **30 perguntas-teste** que valida bypasses paramétricos, conceitos fixos, detector de dados faltantes e respostas do LLM. Roda **antes de qualquer deploy** pra evitar regressão.

### Comandos

```bash
# Rápido (só bypasses, GRATUITO, ~1 segundo)
npm run test:regressao

# Completo (inclui LLM, custa ~R$0,15, ~60 segundos)
npm run test:regressao:full

# Roda só um caso específico
node scripts/run-regression.js --only=24
```

### O que cada teste verifica

| Validação | Como funciona |
|---|---|
| `deve_conter` | Strings/regex que **devem** aparecer na resposta (case-insensitive) |
| `nao_deve_conter` | Strings que **não devem** aparecer (formato antigo, AWG, etc) |
| `ib_esperado_min/max` | Faixa de IB esperada (extraída via regex `IB ≈ X A` na resposta) |
| `bitola_esperada` | Bitola que deve aparecer (ex: "300 mm²") |

### Saída esperada

```
═══ SUÍTE DE REGRESSÃO — SEU ENGENHEIRO AI ═══
30 casos | LLM: ON

[ 1] saudacao                       0ms  ✓ PASS
[ 2] saudacao                       0ms  ✓ PASS
...
[24] llm_calculo_motor           9924ms  ✓ PASS
[25] llm_calculo_chuveiro        6460ms  ✓ PASS
...

═══ SUMÁRIO ═══
✓ Passou: 30
✗ Falhou: 0
Taxa de sucesso: 100.0%
```

### Adicionando novos casos

Quando descobrir um novo bug:

1. Reproduza no WhatsApp
2. Adicione um caso novo em `tests/regressao.json` com a pergunta + o que esperava
3. Rode `npm run test:regressao` — deve **falhar** (confirma reprodução)
4. Corrija o código
5. Rode novamente — deve **passar**
6. Commit (o caso protege contra regressão futura)

Exemplo de caso novo:

```json
{
  "id": 31,
  "categoria": "novo_bug",
  "tipo": "bypass",
  "pergunta": "minha pergunta",
  "deve_conter": ["valor esperado", "norma esperada"],
  "nao_deve_conter": ["AWG", "formato antigo"]
}
```

### Tipos de teste

- **`bypass`** — Roda offline, testa funções determinísticas (saudações, conceitos fixos, cálculos paramétricos). **Gratuito**.
- **`dados_faltantes`** — Roda offline, testa detector de dados incompletos. **Gratuito**.
- **`llm`** — Chama OpenAI real. **Custa ~R$0,005 por caso**. Só roda com `--llm`.

### Fluxo recomendado pré-deploy

```bash
# 1. Rodar suíte rápida (gratuita, sempre)
npm run test:regressao

# 2. Se passou, rodar completa (com LLM)
npm run test:regressao:full

# 3. Se ambas passaram, fazer deploy
git push origin main   # Vercel deploy automático
```

---

## 🔧 Outros comandos

```bash
npm run dev      # vercel dev local
npm run deploy   # vercel --prod
npm run seed     # popula knowledge_chunks no Supabase
npm run smoke    # smoke test básico
```

---

## 🏗️ Arquitetura

- `api/webhook.js` — endpoint Z-API, roteia mensagens (saudação, conceitos, bypasses, LLM)
- `lib/claude.js` — chamada OpenAI + pós-processamento (validação, SI, frases robóticas, minimalismo, disclaimer)
- `lib/validacao.js` — validador técnico programático (bitolas, disjuntores, normas, IB)
- `lib/dadosFaltantes.js` — detector de dados incompletos
- `lib/rag.js` — RAG com pgvector + cache semântico
- `lib/supabase.js` — persistência (usuários, conversas, limites)
- `lib/zapi.js` — integração WhatsApp (Z-API)
- `core.txt` / `prompt.txt` — system prompts (estrutura 5 BLOCOS)
- `tests/regressao.json` — casos de teste
- `scripts/run-regression.js` — runner da suíte
