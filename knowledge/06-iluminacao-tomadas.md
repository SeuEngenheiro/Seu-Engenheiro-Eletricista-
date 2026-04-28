# Iluminação e Tomadas — NBR 5410 + NBR ISO/CIE 8995-1

## Iluminância Recomendada (lux)

Base: NBR ISO/CIE 8995-1 (substitui NBR 5413).

### Residencial

| Ambiente | Iluminância (lux) |
|----------|-------------------|
| Sala de estar (geral) | 100 |
| Sala de estar (leitura) | 300 |
| Cozinha (geral) | 200 |
| Cozinha (bancada) | 500 |
| Quarto (geral) | 100 |
| Quarto (leitura) | 300 |
| Banheiro (geral) | 200 |
| Banheiro (espelho) | 500 |
| Escritório residencial | 500 |
| Garagem | 75 |
| Áreas externas | 30-100 |

### Comercial / Industrial

| Local | Iluminância (lux) |
|-------|-------------------|
| Escritório (geral) | 500 |
| Sala de reunião | 500 |
| Recepção | 300 |
| Loja (geral) | 500 |
| Loja (vitrine) | 1000 |
| Restaurante | 200 |
| Sala de aula | 500 |
| Hospital (corredor) | 200 |
| Hospital (sala cirurgia) | 1000 (geral) + 10000 (campo) |
| Indústria (geral) | 200-500 |
| Indústria (precisão) | 750-1500 |

## Cálculo Luminotécnico (método dos lúmens)

N = (E × A) / (Φ × FU × FM)

Onde:
- N  = número de luminárias
- E  = iluminância requerida (lux)
- A  = área (m²)
- Φ  = fluxo luminoso por luminária (lm)
- FU = fator de utilização (0,3 a 0,7 conforme refletância e geometria)
- FM = fator de manutenção (0,7 a 0,8)

### LEDs típicos
- Painel LED 60×60 cm 36W → ~3600 lm
- Lâmpada LED 9W → ~900 lm
- Lâmpada LED 12W → ~1200 lm
- Eficiência: 80-150 lm/W

## Circuitos Terminais — NBR 5410

### Carga mínima de iluminação (item 9.5.2.1)

| Área (m²) | Carga mínima |
|-----------|--------------|
| ≤ 6 m²  | 100 VA |
| > 6 m²  | 100 VA + 60 VA por 4m² adicionais |

### Tomadas de uso geral (TUG) — item 9.5.2.2

Cada cômodo:
- Área ≤ 2,25 m²: 1 ponto, 100 VA
- Cozinhas, copas, áreas serviço, lavanderias: 1 ponto a cada 3,5m de perímetro, 600 VA cada um (até 3) e 100 VA os demais
- Banheiros: 1 ponto próximo ao lavatório, 600 VA
- Outros cômodos (sala, quarto): 1 ponto a cada 5m de perímetro ou fração, 100 VA cada
- Varandas: 1 ponto, 100 VA

### Tomadas de uso específico (TUE) — item 9.5.2.3

- Para cada equipamento de potência conhecida (chuveiro, ar-condicionado, máquina de lavar)
- Carga = potência nominal do equipamento
- Distância ≤ 1,5 m do equipamento

## Divisão de Circuitos (NBR 5410 9.5.3)

Mínimo:
- 1 circuito de iluminação
- 1 circuito de tomadas
- Circuito independente para cada TUE > 600 VA

Cada circuito:
- Disjuntor independente
- Sem mistura ilum + tomadas (boa prática)

### Limites práticos
- Iluminação: até 1.270 VA (10A × 127V) ou 2.200 VA (10A × 220V)
- TUG residencial: 1.500-2.000 VA por circuito
- TUE: dimensionado pela carga específica

## Cabos Mínimos (NBR 5410 6.2.6)

| Aplicação | Seção mínima |
|-----------|--------------|
| Iluminação | 1,5 mm² |
| Tomadas (TUG) | 2,5 mm² |
| TUE chuveiro 5500W 220V | 4,0 mm² |
| TUE chuveiro 7500W 220V | 6,0 mm² |
| Aterramento de equipamento | igual ao fase (até 16mm²) |

## Disjuntores Típicos por Circuito

| Circuito | Disjuntor |
|----------|-----------|
| Iluminação 127V | 10A curva B |
| Iluminação 220V | 10A curva B |
| TUG 127V | 16-20A curva C |
| TUG 220V | 16A curva C |
| Chuveiro 5500W 220V | 32A curva B |
| Chuveiro 7500W 220V | 40A curva B |
| Ar-cond split 9000 BTU | 16A curva C |
| Ar-cond split 12000 BTU | 20A curva C |
| Ar-cond split 18000 BTU | 25A curva C |

## Proteção DR (NBR 5410 5.1.3) — Obrigatório

DR 30mA tipo A em:
- Tomadas em áreas internas habitacionais
- Áreas externas
- Banheiros, cozinhas, lavanderias, áreas de serviço
- Áreas molhadas

## Iluminação de Emergência (NBR 10898)

- Autonomia mínima: 1 hora
- Iluminância mínima nas rotas de fuga: 5 lux
- Sinalização de saída obrigatória
- Circuitos independentes ou luminárias autônomas

## Erros Comuns

❌ Misturar iluminação e tomadas no mesmo circuito sem critério
❌ Não prever TUE para chuveiro/ar (fica subdimensionado)
❌ Esquecer DR em banheiro/cozinha
❌ Cabo 1,5mm² em tomada (NBR exige 2,5mm² mínimo)
❌ Não considerar perímetro real para TUGs em cozinha
❌ Iluminância insuficiente em ambiente de leitura/trabalho

## Regras Críticas

- Sempre divisão clara entre ilum e tomadas
- TUE = circuito dedicado
- DR 30mA obrigatório em áreas molhadas
- Carga mínima de iluminação respeita NBR 5410 9.5.2.1
- Cabo mínimo: 1,5mm² ilum / 2,5mm² tomada
