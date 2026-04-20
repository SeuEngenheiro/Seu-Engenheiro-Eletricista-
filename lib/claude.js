import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = readFileSync(join(process.cwd(), 'prompt.txt'), 'utf-8');

const historicos = new Map();
const TEMPO_SESSAO = 30 * 60 * 1000;

function getHistorico(telefone) {
  const entrada = historicos.get(telefone);
  if (!entrada) return [];
  if (Date.now() - entrada.timestamp > TEMPO_SESSAO) {
    historicos.delete(telefone);
    return [];
  }
  return entrada.mensagens;
}

function salvarHistorico(telefone, mensagens) {
  historicos.set(telefone, { mensagens, timestamp: Date.now() });
}

export async function chamarClaude(telefone, mensagem, plano = 'gratis') {
  try {
    const historico = getHistorico(telefone);
    const contextoPlano = plano !== 'gratis'
      ? `\n[CONTEXTO: Usuário com plano ${plano.toUpperCase()} — acesso completo liberado]`
      : `\n[CONTEXTO: Usuário com plano GRÁTIS — NBR 5410 liberada, outras normas bloqueadas pelo sistema]`;

    const mensagens = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historico,
      { role: 'user', content: mensagem + contextoPlano }
    ];

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search_preview',
          search_context_size: 'medium'
        }
      ],
      tool_choice: 'auto',
      messages: mensagens
    });

    const resposta = response.choices[0].message.content || 
      response.choices[0].message.tool_calls?.map(t => t.function?.output).join('\n') || 
      'Não consegui processar sua pergunta. Tente novamente.';

    const novoHistorico = [
      ...historico,
      { role: 'user', content: mensagem },
      { role: 'assistant', content: resposta }
    ].slice(-10);

    salvarHistorico(telefone, novoHistorico);
    return resposta;

  } catch (err) {
    console.error('[OPENAI ERROR]', err);
    // Fallback sem web search se der erro
    try {
      const historico = getHistorico(telefone);
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...historico,
          { role: 'user', content: mensagem }
        ]
      });
      return response.choices[0].message.content;
    } catch (err2) {
      throw new Error('Erro ao chamar a IA. Tente novamente.');
    }
  }
}
