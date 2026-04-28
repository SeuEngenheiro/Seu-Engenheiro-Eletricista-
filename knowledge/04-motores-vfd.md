# Motores e Sistemas Industriais — NBR 5410 + IEC 60034

## Conversões e Cálculos

### Conversões
- 1 CV = 0,736 kW (sistema métrico)
- 1 HP = 0,746 kW (sistema americano)

### Corrente Nominal (IB)

🔹 Trifásico:
IB = P / (√3 × V × η × FP)

🔹 Monofásico:
IB = P / (V × η × FP)

Onde:
- P  = potência (W)
- V  = tensão (V)
- η  = rendimento
- FP = fator de potência

### Valores típicos
- η  ≈ 0,85 a 0,95 (motores maiores → melhor)
- FP ≈ 0,75 a 0,90

Padrão se não informado: η = 0,90 e FP = 0,85

## Corrente de Partida

| Tipo | Ip / In |
|------|---------|
| Direta (DOL) | 6 a 10 × In |
| Estrela-triângulo (Y-Δ) | ~3 × In |
| Soft-starter | controlada (rampa, 2-4× In) |
| VFD (inversor) | ~1× In |

## Tipos de Partida

### DIRETA (DOL — Direct On-Line)
- Mais simples e barata
- Até ~7,5 CV (referência prática brasileira)
- Alta corrente de partida (afeta rede)
- Alto torque na partida (impacto mecânico)

### ESTRELA-TRIÂNGULO (Y-Δ)
- Reduz corrente de partida em ~1/3
- Reduz torque em ~1/3 também
- Exige motor compatível (6 terminais)
- Faixa típica: 7,5 a 75 CV

### SOFT-STARTER
- Controle eletrônico de rampa de tensão
- Reduz impacto mecânico e elétrico
- Não controla velocidade contínua
- Boa para bombas, compressores
- Faixa: até centenas de CV

### INVERSOR DE FREQUÊNCIA (VFD)
- Controle total de velocidade (V/Hz ou vetorial)
- Alta eficiência energética
- Pode gerar harmônicas (THD)
- Exige cabo blindado e DR tipo F ou B
- Considerar harmônicos no dimensionamento do neutro

## Proteções de Motor

### Disjuntor motor
- Proteção contra curto e sobrecarga
- Curva D (ou C para motores pequenos)
- IN escolhido considerando Ip
- Modelos específicos: termomagnético com regulagem térmica

### Relé térmico
- Proteção contra sobrecarga
- Ajustado à corrente nominal do motor (1,0 a 1,15× In)
- Classe de disparo: 10 (padrão), 20 (partida pesada), 30 (especial)

### Contatores
- Manobra do motor
- AC-3 (motores) ou AC-4 (frenagem)
- Dimensionar pela potência ou corrente nominal

### Proteções adicionais
- Falta de fase (relé monitor)
- Subtensão / sobretensão
- Sequência de fase
- PT100 (proteção térmica integrada)

## Cabo do Motor

### Dimensionamento
- IB calculado conforme acima
- Aplicar fator 1,15 para serviço contínuo S1 (margem)
- Verificar IZ ≥ IB × 1,15

### Para VFD
- Cabo blindado (reduz EMI)
- Considerar capacitância (pode exigir filtro dV/dt)
- Distância motor-VFD: limitar conforme fabricante (típico 50-100m sem filtro)

## Banco de Capacitores

### Objetivo
- Reduzir energia reativa
- Evitar multas (FP ≥ 0,92 conforme ANEEL)
- Aliviar carga em transformadores e cabos

### Tipos
- Fixo (correção média estimada)
- Automático (banco com controlador, varia degraus)

### Cálculo da potência reativa necessária
Q (kVAr) = P (kW) × (tan φ_atual − tan φ_desejado)

### Cuidados
- Compatibilidade com VFDs (harmônicas)
- Reator de bloqueio em ambientes com alta THD
- Proteção dedicada (Icu adequado a banco)

## Análise de Demanda

### Fator de demanda
FD = Demanda máxima / Carga instalada

### Fator de simultaneidade
FS = Cargas operando simultaneamente / Total

### Demanda real
P_demanda = P_instalada × FD × FS

Define o dimensionamento do alimentador e transformador.

## Qualidade de Energia

### Harmônicas
- Geradas por VFDs, eletrônicos
- Aquecimento adicional em cabos e transformadores
- THD máximo recomendado: 5% (V), 8% (I) — IEEE 519
- Cabo de neutro pode exigir 100% ou mais

### Desequilíbrio
- Diferença entre fases
- Afeta motores (perda de torque, aquecimento)
- Limite: 2% (IEC 61000-2-2)

### Flutuação
- Variações de tensão
- Impacta equipamentos sensíveis
- Avaliar com flickerímetro

## Verificações Obrigatórias

☑ Corrente nominal correta (com η e FP)
☑ Corrente de partida considerada (Ip × In)
☑ Proteção adequada (curva D, relé térmico)
☑ Coordenação entre dispositivos
☑ Fator de potência analisado
☑ Impacto na rede avaliado (queda de tensão na partida)
☑ Para VFD: harmônicas e DR tipo B/F

## Erros Comuns

❌ Dimensionar motor só pela potência (sem η/FP)
❌ Ignorar corrente de partida (curva B em motor)
❌ Usar disjuntor convencional onde precisa termomagnético
❌ Não proteger contra falta de fase (queima motor)
❌ Ignorar harmônicas em sistema com vários VFDs
❌ Usar DR tipo AC em VFD (não atua corretamente)

## Regras Críticas

- Motor não é carga comum — partida define proteção
- VFD exige análise de qualidade de energia
- Proteção deve ser coordenada (disjuntor + relé térmico + contator)
- Sempre verificar queda de tensão na partida (motores grandes)
