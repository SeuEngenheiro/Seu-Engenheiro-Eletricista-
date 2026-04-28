# Disjuntores, DR e DPS — NBR 5410 + IEC 60898/60947-2

## Disjuntores — Correntes Comerciais (IN)

Valores padrão (A): 6, 10, 16, 20, 25, 32, 40, 50, 63, 80,
100, 125, 160, 200, 250, 300, 400, 500, 630.

Selecionar valor comercial imediatamente acima de IB.

## Curvas de Disparo

| Curva | Faixa magnética | Aplicação |
|-------|-----------------|-----------|
| B     | 3 a 5 × IN      | Cargas resistivas, iluminação, residencial |
| C     | 5 a 10 × IN     | Uso geral, tomadas, motores pequenos |
| D     | 10 a 20 × IN    | Altas correntes de partida, motores grandes, transformadores |

Selecionar conforme corrente de partida da carga.

## Tipos Construtivos

- Monopolar (1P)  → fase única
- Bipolar (2P)    → fase + neutro (ou bifásico)
- Tripolar (3P)   → trifásico
- Tetrapolar (4P) → trifásico + neutro

## Capacidade de Interrupção (Icn / Icu)

Residenciais (NBR IEC 60898): 3 kA, 6 kA, 10 kA
Industriais (NBR IEC 60947-2): 10 kA, 25 kA, 36 kA ou superior

REGRA OBRIGATÓRIA: Icn/Icu ≥ Ik (corrente de curto-circuito do ponto)

## Coordenação Cabo × Disjuntor (NBR 5410 5.3.4)

Condições:
- IB ≤ IN ≤ IZ
- I2 ≤ 1,45 × IZ (I2 = corrente convencional de atuação)

Verificação térmica (curto):
S ≥ √(I² × t) / k

Onde:
- S = seção do condutor (mm²)
- I = corrente de curto (A)
- t = tempo de atuação (s)
- k = constante do material (Cu = 115, Al = 76 para PVC)

## DR — Dispositivo Diferencial Residual

### Sensibilidades
- 10 mA  → uso especial sensível
- 30 mA  → proteção de pessoas (PADRÃO NBR 5410)
- 100 mA → proteção contra incêndio
- 300 mA → proteção geral industrial / incêndio

### Tipos
- **AC**: corrente alternada pura (uso simples, cada vez menos recomendado)
- **A**: AC + pulsante DC (PADRÃO atual, uso geral com eletrônica)
- **F**: correntes de frequência variável (motores com VFD)
- **B**: DC pura + AC (FV / VFD / carregadores EV)

### Onde é obrigatório (NBR 5410 5.1.3) — 30 mA
- Tomadas em áreas internas
- Áreas externas
- Banheiros, cozinhas, lavanderias
- Áreas molhadas

### Onde evitar (ou usar com critério)
- Sistemas críticos (alarmes, data center, equipamentos médicos)
- Pode causar desligamentos indevidos
- Usar seletividade ou DR específico

### Coordenação e seletividade
DR a montante: maior IΔn (300 mA) e tipo S (seletivo, atraso)
DR a jusante: 30 mA (proteção de pessoas)
Evita desligamento geral da instalação.

## DPS — Dispositivo de Proteção contra Surtos

### Classes

| Classe | Função | Local |
|--------|--------|-------|
| Tipo 1 (Classe I)   | Correntes de raio | Entrada (quadro geral) |
| Tipo 2 (Classe II)  | Surtos indiretos | Quadros de distribuição |
| Tipo 3 (Classe III) | Proteção fina | Próximo aos equipamentos |

### Tecnologias
- Varistor (MOV) → mais comum
- Centelhador / gap → alta energia
- Faísca → uso específico

### Parâmetros
- **Uc**: tensão máxima de operação contínua
- **In**: corrente nominal de descarga (kA)
- **Iimp**: corrente de impulso (Tipo 1, 10/350μs)
- **Imax**: corrente máxima de descarga (kA)
- **Up**: nível de proteção (tensão residual, kV)

### Onde instalar
- Entrada da instalação: Tipo 1 ou 2
- Quadros secundários: Tipo 2
- Próximo a cargas sensíveis: Tipo 3

### Coordenação com aterramento
- DPS deve estar ligado ao PE
- Cabo de ligação ao aterramento o mais curto possível
- Baixa impedância do aterramento

## Verificações Obrigatórias

DR:
☑ Sensibilidade correta
☑ Tipo adequado à carga
☑ Aplicação conforme norma
☑ Seletividade entre dispositivos

DPS:
☑ Classe correta (1, 2 ou 3)
☑ Uc compatível com a rede (Uc ≥ 1,1 × U fase)
☑ Ligação correta ao PE
☑ Instalação em cascata

## Erros Comuns

DR:
❌ Não usar em áreas obrigatórias
❌ Usar tipo AC em cargas eletrônicas modernas
❌ Não prever seletividade (DR único na entrada)
❌ Não usar tipo B em FV/VFD/EV

DPS:
❌ Não instalar DPS
❌ Ligação longa ao aterramento
❌ Escolher Uc errado (subdimensionado)
❌ Não coordenar classes em cascata

## Regras Críticas

- DR protege pessoas — DPS protege equipamentos
- DPS depende de bom aterramento
- DR mal aplicado pode desligar tudo
- Sempre proteção em conjunto: DR + DPS + aterramento
