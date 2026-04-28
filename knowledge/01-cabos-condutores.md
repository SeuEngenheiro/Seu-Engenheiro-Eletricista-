# Cabos e Condutores — NBR 5410

## Tabela 36 (PVC 70°C) — Cobre, temperatura ambiente 30°C

Capacidade de condução IZ (A) por método de instalação:

```
S(mm²) | B1   | B2  | C   | D   | E   | F
─────────────────────────────────────────────
1,5    | 17,5 | 16  | 19  | 22  | 21  | 24
2,5    | 24   | 22  | 26  | 29  | 28  | 33
4,0    | 32   | 30  | 35  | 38  | 36  | 45
6,0    | 41   | 38  | 46  | 47  | 50  | 58
10     | 57   | 52  | 63  | 63  | 68  | 80
16     | 76   | 69  | 85  | 81  | 91  | 107
25     | 101  | 90  | 112 | 104 | 119 | 138
35     | 125  | 111 | 138 | 125 | 146 | 171
50     | 151  | 133 | 168 | 154 | 175 | 209
70     | 192  | 168 | 213 | 187 | 221 | 269
95     | 232  | 201 | 258 | 225 | 265 | 328
120    | 269  | 232 | 299 | 258 | 305 | 382
150    | 309  | 265 | 344 | 297 | 354 | 441
185    | 353  | 300 | 392 | 339 | 402 | 506
240    | 415  | 351 | 461 | 402 | 472 | 599
300    | 473  | 401 | 530 | 461 | 540 | 691
```

## Tabela 37 (EPR/XLPE/HEPR 90°C) — Cobre, 30°C

```
S(mm²) | B1   | B2  | C   | D   | E   | F
─────────────────────────────────────────────
1,5    | 23   | 22  | 24  | 26  | 26  | 32
2,5    | 31   | 30  | 33  | 34  | 35  | 43
4,0    | 42   | 40  | 45  | 44  | 46  | 57
6,0    | 54   | 51  | 58  | 56  | 58  | 73
10     | 75   | 69  | 80  | 73  | 79  | 100
16     | 100  | 91  | 107 | 95  | 105 | 134
25     | 133  | 119 | 142 | 121 | 138 | 173
35     | 164  | 146 | 175 | 146 | 169 | 215
50     | 198  | 175 | 213 | 173 | 202 | 263
70     | 253  | 221 | 270 | 213 | 256 | 339
95     | 306  | 265 | 327 | 256 | 308 | 414
120    | 354  | 305 | 380 | 295 | 354 | 482
150    | 407  | 349 | 437 | 339 | 410 | 558
185    | 464  | 396 | 500 | 384 | 467 | 642
240    | 546  | 463 | 590 | 451 | 552 | 760
300    | 626  | 530 | 678 | 514 | 633 | 875
```

## Métodos de Instalação

- **A1** — Condutores isolados em eletroduto em parede termicamente isolante
- **A2** — Cabo multipolar em eletroduto em parede termicamente isolante
- **B1** — Condutores isolados em eletroduto aparente em parede
- **B2** — Cabo multipolar em eletroduto aparente em parede
- **C**  — Cabos diretamente em parede ou bandeja
- **D**  — Cabos enterrados (eletroduto ou direto)
- **E**  — Cabo multipolar ao ar livre
- **F**  — Cabos unipolares justapostos ao ar livre

## Fatores de Correção (OBRIGATÓRIO aplicar)

Tabela 36/37 vale apenas para 30°C ambiente e sem agrupamento.

### Temperatura ambiente (Tabela 40 — fator k1)

PVC 70°C:
- 25°C: 1,06
- 30°C: 1,00
- 35°C: 0,94
- 40°C: 0,87
- 45°C: 0,79
- 50°C: 0,71

EPR/XLPE 90°C:
- 25°C: 1,04
- 30°C: 1,00
- 35°C: 0,96
- 40°C: 0,91
- 45°C: 0,87
- 50°C: 0,82

### Agrupamento de circuitos (Tabela 42 — fator k2)

Em eletroduto/bandeja, cabos justapostos:
- 1 circuito:  1,00
- 2 circuitos: 0,80
- 3 circuitos: 0,70
- 4 circuitos: 0,65
- 5 circuitos: 0,60
- 6 circuitos: 0,57
- 7-9:         0,54
- 10-12:       0,50

### Aplicação
IZ_real = IZ_tabela × k1 × k2

## Alumínio

IZ_Al ≈ 0,77 × IZ_Cu (varia 0,75 a 0,80 conforme fabricante).
Sempre confirmar em catálogo. Alumínio exige seção maior que cobre.

## Boas Práticas

- Sempre verificar queda de tensão além da corrente
- Considerar temperatura e agrupamento
- Validar IB ≤ IN ≤ IZ (após fatores)
- Cargas críticas → margem de segurança
- Para circuitos longos (>30m), queda de tensão pode dominar

## Erros comuns

- Usar Tabela 36 para cabos EPR/XLPE (subdimensiona)
- Não aplicar fatores de correção
- Confundir B1 com B2 (B1 = condutores isolados; B2 = multipolar)
- Esquecer alumínio (≈0,77×Cu)
