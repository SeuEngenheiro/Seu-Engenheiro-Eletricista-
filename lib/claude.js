import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { toFile } from 'openai/uploads';
import { buscarConversasRecentes } from './supabase.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = readFileSync(join(process.cwd(), 'prompt.txt'), 'utf-8');

export async function chamarClaude(telefone, mensagem, plano = 'gratis') {
  try {
    const historico = await buscarConversasRecentes(telefone, 10);

    const contextoPlano = plano !== 'gratis'
      ? `\n[PLANO: ${plano.toUpperCase()} — acesso completo]`
      : `\n[PLANO: GRÁTIS]`;

    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 4000,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historico,
        { role: 'user', content: mensagem + contextoPlano }
      ]
    });

    const resposta = response.choices[0].message.content;
    if (!resposta || resposta.trim().length === 0) {
      console.error('[OPENAI VAZIO]', JSON.stringify(response));
      throw new Error('Resposta vazia da IA');
    }
    return resposta;

  } catch (err) {
    console.error('[OPENAI ERROR]', err);
    throw new Error('Erro ao chamar a IA. Tente novamente.');
  }
}

export async function analisarFoto(telefone, imageBase64, mimeType, plano = 'pro') {
  try {
    const historico = await buscarConversasRecentes(telefone, 10);

    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 4000,
      reasoning_effort: 'low',
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
    if (!resposta || resposta.trim().length === 0) {
      throw new Error('Resposta vazia da IA');
    }
    return resposta;

  } catch (err) {
    console.error('[OPENAI FOTO ERROR]', err);
    throw new Error('Erro ao analisar foto.');
  }
}

export async function buscarPrecosIA(telefone, mensagem, plano = 'premium') {
  try {
    const historico = await buscarConversasRecentes(telefone, 10);

    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 4000,
      reasoning_effort: 'low',
      tools: [{ type: 'web_search_preview', search_context_size: 'medium' }],
      tool_choice: 'required',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historico,
        { role: 'user', content: mensagem + '\n[PREMIUM: buscar preços atuais de materiais elétricos Brasil 2026. Usar faixa R$X a R$Y. Responder em uma única mensagem. Sem LaTeX. Sem markdown headers.]' }
      ]
    });

    const resposta = response.choices[0].message.content || 'Não consegui buscar os preços agora. Tente novamente!';
    return resposta;

  } catch (err) {
    console.error('[BUSCA PRECOS ERROR]', err);
    throw new Error('Erro ao buscar preços.');
  }
}

// ═══════════════════════════════════════════════════════════════
// TRANSCRIÇÃO DE ÁUDIO (Speech-to-Text)
// Adicionado em 27/04/2026 — habilita áudio de entrada via WhatsApp
// ═══════════════════════════════════════════════════════════════

export async function transcreverAudio(audioBuffer, mimeType = 'audio/ogg') {
  try {
    // Determina extensão pelo mimeType
    let extensao = 'ogg';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) extensao = 'mp3';
    else if (mimeType.includes('wav')) extensao = 'wav';
    else if (mimeType.includes('m4a')) extensao = 'm4a';
    else if (mimeType.includes('webm')) extensao = 'webm';

    const file = await toFile(audioBuffer, `audio.${extensao}`, { type: mimeType });

    const response = await client.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'pt',
      prompt: 'Transcrição em português brasileiro de pergunta sobre engenharia elétrica. Termos técnicos: disjuntor, cabo, NBR 5410, motor, chuveiro, kVA, kW, CV, ampere, volts, queda de tensão, fator de potência, DR, DPS.'
    });

    const texto = response.text?.trim();
    if (!texto || texto.length === 0) {
      throw new Error('Transcrição vazia');
    }

    return texto;

  } catch (err) {
    console.error('[WHISPER ERROR]', err);
    throw new Error('Erro ao transcrever áudio.');
  }
}
