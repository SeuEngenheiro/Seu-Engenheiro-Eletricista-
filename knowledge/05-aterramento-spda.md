# Aterramento e SPDA — NBR 5410 6.4 + NBR 5419

## Função do Aterramento

1. **Proteção de pessoas** contra choque elétrico
2. **Funcionamento correto** da instalação (referência de potencial)

Atua junto com:
- Disjuntores
- DR (diferencial residual)
- DPS (proteção contra surtos)

## Esquemas de Aterramento

### TT
- Neutro aterrado na origem (concessionária)
- Massas aterradas localmente (haste do consumidor)
- ✔ Uso comum em residências brasileiras
- ⚠️ Necessita obrigatoriamente de DR

### TN-S
- Neutro (N) e proteção (PE) separados desde a origem
- ✔ Maior segurança
- ✔ Melhor desempenho elétrico
- Preferido em projetos novos comerciais/industriais

### TN-C
- Neutro e proteção combinados (PEN, condutor único)
- ⚠️ Uso restrito (só alimentadores/distribuição)
- ❌ NÃO permitido em circuitos terminais (NBR 5410)

### TN-C-S
- Início em PEN, depois separado em N + PE
- ✔ Muito usado em redes públicas
- Requer cuidado na transição (BEP)

### IT
- Sistema isolado da terra (ou alta impedância)
- ✔ Uso em hospitais, processos críticos
- ✔ Alta continuidade de serviço (não desliga em primeira falta)
- Exige monitor de isolamento

## Resistência de Aterramento

| Valor | Aplicação |
|-------|-----------|
| ≤ 25 Ω | Aceitável (condição geral, NBR 5410) |
| ≤ 10 Ω | Recomendado (boa prática) |
| ≤ 5 Ω  | SPDA exigência |
| ≤ 1 Ω  | Subestações, hospitais |

⚠️ Em sistemas com DR → foco é a atuação do DR, não só a resistência.

## Tipos de Eletrodos

### Haste vertical
- Mais comum (haste de cobre 2,4m × 5/8")
- Fácil instalação
- Múltiplas hastes em paralelo (espaçamento ≥ comprimento da haste)

### Malha de aterramento
- Alta eficiência
- Indústrias e subestações
- Reduz tensão de passo e toque

### Aterramento de fundação (Ufer)
- Excelente desempenho (baixa resistência, baixa variação sazonal)
- Integra com armadura do edifício
- Recomendado em construções novas

## Equipotencialização

Objetivo:
- Igualar potenciais
- Reduzir tensão de toque

Elementos:
- BEP (Barramento de Equipotencialização Principal)
- Condutores de proteção (PE)
- Ligações equipotenciais (tubulações metálicas, gás, água)

Obrigatório em instalações modernas (NBR 5410 6.4).

# SPDA — NBR 5419

## Classes de Proteção (LPS)

Definidas pela avaliação de risco:

| Classe | Nível | Eficiência |
|--------|-------|------------|
| LPS I   | Maior nível | 98% |
| LPS II  | Alto | 95% |
| LPS III | Médio | 90% |
| LPS IV  | Básico | 80% |

Quanto maior o risco, mais rigoroso o projeto.

## Métodos de Proteção

### Esfera Rolante (método principal, normativo)
Raio depende da classe:
- LPS I:   20 m
- LPS II:  30 m
- LPS III: 45 m
- LPS IV:  60 m

A esfera é "rolada" sobre a estrutura. Pontos tocados = vulneráveis.

### Ângulo de Proteção
Método simplificado, aplicável em alturas limitadas (até ~60m).
Ângulo varia com altura e classe.

### Gaiola de Faraday (Malha)
Captação distribuída em grade. Alta eficiência. Uso em grandes
estruturas (galpões, prédios altos).

Espaçamento típico:
- LPS I:   5 × 5 m
- LPS II:  10 × 10 m
- LPS III: 15 × 15 m
- LPS IV:  20 × 20 m

## Densidade Ceráunica (Ng)

Ng = descargas/km²/ano

Varia conforme região do Brasil (mapa NBR 5419):
- Norte/Centro-Oeste: alto (>10)
- Sul/Sudeste: médio (5-10)
- Nordeste litoral: baixo (<5)

## Avaliação de Risco (R)

Considera:
- Tipo de estrutura (residencial, hospital, indústria)
- Ocupação (densidade de pessoas)
- Localização (Ng, terreno)
- Consequências de falha (humana, patrimônio, serviço)

Se R > Rt (risco tolerável) → SPDA obrigatório.

## Subsistemas do SPDA

### Captação
- Hastes (Franklin), cabos, malha
- Intercepta descargas

### Descidas
- Conduzem corrente ao solo
- Múltiplas e distribuídas (espaçamento conforme classe)
- Mínimo 2 descidas (LPS III/IV)

### Aterramento
- Dissipa corrente no solo
- Tipo A (hastes) ou B (anel + hastes/malha)
- Resistência ≤ 10 Ω (recomendado)

## Materiais

- Cobre (preferido)
- Alumínio (não enterrado, atenção corrosão)
- Aço galvanizado (custo menor)

Critérios:
- Resistência mecânica
- Resistência à corrosão
- Compatibilidade eletroquímica

## Distância de Segurança (s)

Evita centelhamento perigoso entre SPDA e instalações próximas:

s = (ki × kc × L) / km

Onde:
- ki = nível de proteção (0,02 a 0,08)
- kc = distribuição de corrente
- L  = comprimento até o ponto de equipotencialização (m)
- km = material isolante (1,0 ar / 0,5 sólido)

## Equipotencialização SPDA

Objetivo:
- Evitar diferenças de potencial
- Reduzir risco de choque

Inclui:
- Interligação de massas metálicas
- Integração com aterramento principal
- DPS Tipo 1 na entrada (proteção contra surto da descarga)

## Manutenção e Inspeção

- Inspeção visual periódica (anual)
- Verificação de continuidade
- Medição de aterramento (estação seca)
- Inspeção após descargas próximas

## Casos Especiais

- **Hospitais**: alta exigência, continuidade operacional
- **Escolas**: alta ocupação, prioridade segurança
- **Templos/torres**: estruturas altas, grande exposição
- **Indústrias com inflamáveis**: SPDA + classificação de áreas (NBR IEC 60079)

## Erros Comuns

❌ Aterramento sem continuidade (DR não funciona)
❌ Não usar DR em sistema TT
❌ Misturar neutro com terra após o BEP (esquema TN-S violado)
❌ Ignorar equipotencialização (tensões de toque elevadas)
❌ Não medir resistência de aterramento (estimativa não vale)
❌ SPDA sem avaliação de risco
❌ Subdimensionar descidas

## Regras Críticas

- Aterramento sem continuidade NÃO protege
- DR depende do aterramento correto (esquemas TT/TN)
- Segurança elétrica depende do CONJUNTO (PE + DR + proteção)
- SPDA não é só "para-raios" — é sistema completo
- Sempre validar em campo (medição real, não estimativa)
