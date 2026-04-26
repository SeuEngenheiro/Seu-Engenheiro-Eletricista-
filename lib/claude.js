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
      ? `\n[PLANO: ${plano.toUpperCase()} — acesso completo]`
      : `\n[PLANO: GRÁTIS]`;

    const response = await client.chat.completions.create({
      model: 'gpt-5',
      max_completion_tokens: 1500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historico,
        { role: 'user', content: mensagem + contextoPlano }
      ]
    });

    const resposta = response.choices[0].message.content;
    const novoHistorico = [...historico, { role: 'user', content: mensagem }, { role: 'assistant', content: resposta }].slice(-10);
    salvarHistorico(telefone, novoHistorico);
    return resposta;

  } catch (err) {
    console.error('[OPENAI ERROR]', err);
    throw new Error('Erro ao chamar a IA. Tente novamente.');
  }
}

export async function analisarFoto(telefone, imageBase64, mimeType, plano = 'pro') {
  try {
    const historico = getHistorico(telefone);
    const response = await client.chat.completions.create({
      model: 'gpt-5',
      max_completion_tokens: 1500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historico,
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
            { type: 'text', text: 'Analise esta foto de instalação elétrica. Identifique problemas, riscos e orientações técnicas baseadas na NBR 5410. Responda em uma única mensagem.' }
          ]
        }
      ]
    });

    const resposta = response.choices[0].message.content;
    const novoHistorico = [...historico, { role: 'user', content: '[Foto enviada]' }, { role: 'assistant', content: resposta }].slice(-10);
    salvarHistorico(telefone, novoHistorico);
    return resposta;

  } catch (err) {
    console.error('[OPENAI FOTO ERROR]', err);
    throw new Error('Erro ao analisar foto.');
  }
}

export async function buscarPrecosIA(telefone, mensagem, plano = 'premium') {
  try {
    const historico = getHistorico(telefone);
    const response = await client.chat.completions.create({
      model: 'gpt-5',
      max_completion_tokens: 1500,
      tools: [{ type: 'web_search_preview', search_context_size: 'medium' }],
      tool_choice: 'required',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historico,
        { role: 'user', content: mensagem + '\n[PREMIUM: buscar preços atuais de materiais elétricos Brasil 2026. Usar faixa R$X a R$Y. Responder em uma única mensagem. Sem LaTeX. Sem markdown headers.]' }
      ]
    });

    const resposta = response.choices[0].message.content || 'Não consegui buscar os preços agora. Tente novamente!';
    const novoHistorico = [...historico, { role: 'user', content: mensagem }, { role: 'assistant', content: resposta }].slice(-10);
    salvarHistorico(telefone, novoHistorico);
    return resposta;

  } catch (err) {
    console.error('[BUSCA PRECOS ERROR]', err);
    throw new Error('Erro ao buscar preços.');
  }
}
