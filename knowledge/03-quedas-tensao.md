# Queda de Tensão — NBR 5410 6.2.7

## Limites Máximos

| Limite | Aplicação |
|--------|-----------|
| 4%     | Circuitos de força (TUE) |
| 2%     | Circuitos de iluminação |
| 7%     | Total (alimentador + circuito terminal) |

A soma das quedas ao longo da instalação não pode exceder 7%.

## Fórmulas Básicas

### Monofásico
ΔV% = (2 × ρ × L × IB) / (S × V) × 100

### Trifásico
ΔV% = (√3 × ρ × L × IB) / (S × V) × 100

Onde:
- ρ = resistividade do material (Ω·mm²/m)
- L = comprimento do circuito (m)
- IB = corrente (A)
- S = seção do condutor (mm²)
- V = tensão nominal (V)

### Resistividades a 20°C
- Cobre:    ρ = 0,0175 Ω·mm²/m
- Alumínio: ρ = 0,028 Ω·mm²/m

Corrigir para temperatura quando necessário (aumenta ~0,4%/°C).

## Cargas Indutivas (Motores / MT)

Para maior precisão, considerar impedância:

ΔV% = (√3 × L × IB × (R·cosφ + X·senφ)) / V × 100

Onde:
- R   = resistência do cabo (Ω/km)
- X   = reatância do cabo (Ω/km)
- cosφ = fator de potência

Essencial para:
- Motores (cosφ < 0,9)
- Alimentadores longos
- Média tensão
- Banco de capacitores

## Reatância típica de cabos BT (Ω/km)

| Seção | X (Ω/km) |
|-------|----------|
| 1,5-6 | 0,12 |
| 10-25 | 0,11 |
| 35-95 | 0,10 |
| 120-185 | 0,09 |
| 240-300 | 0,085 |

## Quando Redimensionar o Cabo

Se ΔV% > limite da norma:
- Aumentar a seção do condutor (mesmo se IZ ≥ IB)
- Em longas distâncias → ΔV costuma dominar
- Em cargas grandes → corrente domina

## Soluções Técnicas

Para reduzir queda de tensão:
- Aumentar seção do cabo
- Cabos em paralelo (2 ou mais condutores por fase)
- Reduzir comprimento (otimizar layout)
- Elevar nível de tensão (220→380V; BT→MT)
- Melhorar fator de potência (banco capacitores)

## Regras Práticas (orientação rápida)

- ≤ 30m  → ignorar queda (não crítica)
- > 30m  → calcular obrigatoriamente
- > 100m → cabo pode dobrar de seção
- > 300m → considerar paralelo ou subir tensão

## Exemplo de Cálculo

Motor trifásico 220V, IB = 100 A, L = 80 m, cabo 35 mm² Cu:

ΔV% = (√3 × 0,0175 × 80 × 100) / (35 × 220) × 100
ΔV% = (1,732 × 0,0175 × 80 × 100) / 7700 × 100
ΔV% = 242,5 / 7700 × 100
ΔV% ≈ 3,15%

✅ Dentro do limite de 4% para força.

Se L = 200 m:
ΔV% ≈ 7,87% → ❌ excede. Aumentar para 70 mm² (ΔV ≈ 3,9%).

## Verificações Obrigatórias

☑ ΔV dentro do limite da norma
☑ Cálculo compatível com tipo de sistema (mono/tri)
☑ Material do cabo considerado corretamente (Cu/Al)
☑ Para motores → considerar cosφ
☑ Para longas distâncias → validar precisão
☑ Soma alimentador + terminal ≤ 7%

## Erros Comuns

❌ Ignorar queda de tensão
❌ Dimensionar só por corrente
❌ Usar fórmula monofásica em trifásico
❌ Ignorar fator de potência em motores
❌ Não considerar alumínio corretamente (ρ maior)
❌ Esquecer limite de 7% total
❌ Usar fórmula simplificada (só R) em circuitos longos com motor

## Regras Críticas

- Cabo pode estar OK em corrente e ERRADO em queda
- Queda define seção em longas distâncias
- Sempre validar após dimensionamento inicial
- Segurança e desempenho > economia
