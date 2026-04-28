# Normas Especializadas — MT, Fotovoltaico e NR-10

## NBR 14039 — Média Tensão

### Tensões usuais
- 8,7/15 kV (mais comum em distribuição BR)
- 12/20 kV
- 20/35 kV

### Cabos MT
- Isolação: XLPE / EPR
- Blindagem metálica (semicondutora + tela de cobre)
- Construção unipolar
- Critérios:
  - IZ (corrente admissível)
  - Nível de isolamento
  - Método (duto, bandeja, enterrado)
  - Condições térmicas

### Subestações
- Abrigadas (cabine)
- Ao tempo (outdoor)
- Compactas (cabine primária)

Componentes:
- Transformador (a óleo ou seco)
- Cubículos MT (medição, proteção, manobra, transformação)
- Sistema de proteção (relés)
- Aterramento (malha)

Critérios:
- Segurança
- Acessibilidade
- Ventilação
- Proteção contra arco interno

### Proteção em MT — Códigos ANSI

| ANSI | Função |
|------|--------|
| 50   | Sobrecorrente instantânea |
| 51   | Sobrecorrente temporizada |
| 51N  | Falta à terra (residual) |
| 27   | Subtensão |
| 59   | Sobretensão |
| 81   | Frequência |
| 87   | Diferencial |
| 67   | Sobrecorrente direcional |

### TC e TP

**TC — Transformador de Corrente**
- Reduz corrente para medição/proteção
- Relações típicas: 100/5, 200/5, 400/5, 600/5
- Classes:
  - Medição: 0,3 / 0,6 / 1,2 (precisão)
  - Proteção: 5P10 / 10P20 (suporta sobrecargas)

**TP — Transformador de Potencial**
- Reduz tensão para níveis seguros
- Relações: 13800-√3 / 115-√3
- Classe de exatidão: 0,3 / 0,6 / 1,2

### Curto-circuito em MT
- Determinar Ik (corrente de falha)
- Aplicações:
  - Dimensionamento de equipamentos
  - Seleção de disjuntores
  - Ajuste de relés
- Métodos: simplificado, dados da concessionária, software

### Verificações Obrigatórias MT
☑ Coordenação entre proteção BT e MT
☑ Nível de curto compatível com equipamentos
☑ Ajustes de relés corretos
☑ Aterramento adequado
☑ Conformidade com concessionária

### Erros Comuns MT
❌ Usar critérios de BT em MT
❌ Ignorar curto-circuito
❌ Não coordenar relés
❌ Subdimensionar cabos MT

# Sistemas Fotovoltaicos — NBR 16690 + Lei 14.300/2022

## Tipos de Sistema

### On-grid (conectado à rede)
- Sem baterias
- Injeção na rede
- Compensação de créditos (sistema de compensação SCEE)

### Off-grid (isolado)
- Com baterias
- Independente da rede
- Locais remotos

### Híbrido
- Rede + baterias
- Backup parcial

## Componentes

- **Módulos**: convertem radiação em elétrica
- **Inversores**: string (mais comum), microinversor (modular), central (grande porte)
- **String box CC**: DPS DC + fusíveis + chave seccionadora DC
- **Quadro CA**: disjuntor, DR (Tipo B), DPS AC
- **Aterramento**: equipotencialização

## Dimensionamento

### Geração média mensal
G (kWh/mês) = P_inst × HSP × 30 × η_sistema

Onde:
- P_inst = potência instalada (kWp)
- HSP   = horas de sol pleno (h/dia)
- η_sistema ≈ 75-85% (perdas de inversor, cabos, sujeira)

### Número de módulos
N = P_inst / P_modulo

### Strings (séries)
- Respeitar Vmppt mínimo e Vmax do inversor
- Vstring (frio) ≤ Voc × 1,15 (margem -25°C)
- Vstring (quente) ≥ Vmppt_min

## HSP — Horas de Sol Pleno (Brasil)

Varia conforme região (Atlas Solarimétrico, INPE):
- Nordeste: 5,5 a 6,5 h/dia
- Centro-Oeste: 5,0 a 5,8
- Sudeste: 4,5 a 5,5
- Sul: 4,0 a 5,0
- Norte: 4,5 a 5,5

## Proteções

### Lado CC (corrente contínua)
- DPS Tipo 1+2 ou Tipo 2 (Uc ≥ Voc × 1,2)
- Fusíveis CC (gPV)
- Chave seccionadora CC (sob carga)

### Lado CA (corrente alternada)
- Disjuntor CA (dimensionado pela corrente nominal do inversor)
- DR Tipo B (obrigatório quando inversor não tem isolação galvânica)
- DPS Tipo 2 (entre inversor e quadro principal)

⚠️ Atenção:
- DC não tem cruzamento por zero → arco mais perigoso
- Sempre desligar primeiro o lado CA, depois CC
- Cabo solar específico (PV1-F)

## Conexão com a Rede — REN ANEEL 1.000/2021

### Classificação por potência
- Microgeração: até 75 kW
- Minigeração: 75 kW a 5 MW

### Requisitos
- Padrão de entrada adequado
- Projeto aprovado pela concessionária
- Anuência (parecer de acesso)
- Acordo operativo

### Lei 14.300/2022 — Marco Legal GD

Mudanças principais:
- Cobrança gradual de TUSD Fio B para microgeração:
  - 2023: 15%
  - 2024: 30%
  - 2025: 45%
  - 2026: 60%
  - 2027: 75%
  - 2028: 90%
  - 2029+: regra definitiva (CUSD/CUSDg)
- Sistemas instalados até 7/1/2023 mantêm regras antigas até 2045
- Compensação de créditos por 60 meses

### PRODIST Módulo 3
- Procedimentos de conexão
- Requisitos técnicos (qualidade, proteção, medição)
- Limites de injeção, distorção harmônica, flicker

## Verificações Obrigatórias FV
☑ Dimensionamento correto dos módulos
☑ Strings dentro da faixa do inversor (Vmin/Vmax)
☑ Proteções DC e AC instaladas
☑ Conexão conforme concessionária
☑ Aterramento adequado (incluindo estrutura)
☑ DR Tipo B se aplicável

## Erros Comuns FV
❌ Ignorar tensão máxima do inversor (frio aumenta Voc)
❌ Não usar proteção DC (DPS, fusíveis)
❌ Subdimensionar cabos CC (perdas e queda)
❌ Não considerar sombreamento
❌ Ignorar normas da concessionária
❌ Usar DR Tipo A em vez de B (não atua corretamente)

# NR-10 — Segurança em Eletricidade

## Obrigatoriedade
Aplicável a qualquer trabalho com eletricidade, direto ou indireto.

## Treinamentos

| Curso | Carga | Periodicidade |
|-------|-------|---------------|
| NR-10 Básico | 40h | Inicial |
| SEP (Sistema Elétrico de Potência) | +40h | Inicial |
| Reciclagem | mín. 20h | A cada 2 anos |

## Classificação Profissional

- **Qualificado**: curso específico (técnico/superior)
- **Habilitado**: registro em conselho (CREA, CFT)
- **Autorizado**: liberado formalmente pela empresa

Deve atender aos três para atuação completa.

## Procedimentos de Segurança

### Desenergização — 5 PASSOS OBRIGATÓRIOS

1. **Seccionamento** (abrir o circuito)
2. **Impedimento de reenergização** (bloqueio físico)
3. **Constatação da ausência de tensão** (detector específico)
4. **Instalação de aterramento temporário** (curto-circuito)
5. **Proteção de partes energizadas próximas** (sinalização)

### Bloqueio e Sinalização (LOTO — Lockout/Tagout)
- Bloqueio físico (cadeado, ferrolho)
- Etiquetagem (tag com identificação)
- Controle de acesso
- Múltiplos cadeados se múltiplos profissionais

### Aterramento Temporário
- Igualar potencial entre fases e terra
- Proteger contra reenergização acidental
- Conjunto certificado (NBR 16384)

### APR — Análise Preliminar de Risco
- Identificação de riscos
- Definição de medidas preventivas
- Documentada antes do trabalho

### PT — Permissão de Trabalho
- Documento formal
- Liberação para execução segura
- Assinada por responsável

## EPIs Obrigatórios

✔ Capacete classe B (isolante)
✔ Luvas isolantes (classe adequada à tensão: 00, 0, 1, 2, 3, 4)
✔ Botas isolantes (cano alto)
✔ Vestimenta anti-arco elétrico (calorias adequadas)
✔ Cinturão / talabarte (trabalho em altura)
✔ Óculos de segurança / protetor facial (arco)
✔ Capuz balaclava anti-chama

Seleção conforme nível de risco e ATPV (calorimetria).

## Riscos Elétricos

### Choque Elétrico
- Contração muscular tetânica
- Parada respiratória
- Fibrilação ventricular
- Queimaduras internas

### Arco Elétrico
- Altas temperaturas (até 19.000°C)
- Queimaduras graves
- Projeção de material
- Onda de pressão

### Campos Eletromagnéticos
- Efeitos em longo prazo (estudos)

### Eletricidade Estática
- Risco em áreas inflamáveis (postos, indústrias químicas)

## Distâncias de Segurança

| Tensão | Distância (m) |
|--------|---------------|
| BT (até 1 kV) | 0,20 (zona controlada) |
| 13,8 kV | 0,73 |
| 34,5 kV | 0,92 |
| 138 kV | 2,15 |
| 230 kV | 3,15 |

(Valores conforme NR-10 Anexo II)

Zonas:
- **Zona livre**: distância > zona controlada
- **Zona controlada**: profissional autorizado
- **Zona de risco**: trabalho energizado autorizado

## Situações que Exigem Alerta

🚨 Trabalho energizado sem necessidade comprovada
🚨 Ausência de desligamento
🚨 Falta de EPIs
🚨 Trabalho em altura sem proteção
🚨 Ambiente molhado ou inflamável

## Erros Comuns
❌ Trabalhar energizado sem necessidade
❌ Não usar EPIs adequados
❌ Não aplicar LOTO
❌ Ignorar aterramento temporário
❌ Subestimar risco elétrico

## Regras Críticas
- Segurança é prioridade absoluta
- Nenhuma atividade sem análise de risco
- Desenergização é sempre preferencial
- NR-10 é obrigatória em qualquer nível
- "Esquecer um EPI" pode custar a vida
