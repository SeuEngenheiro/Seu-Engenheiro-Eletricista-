import {
  verificarOuCriarUsuario,
  verificarLimiteCalculos,
  verificarLimitePerguntas,
  verificarLimiteFotos,
  verificarLimiteBuscaPreco,
  registrarCalculo,
  registrarConversa,
  registrarPergunta,
  registrarFoto,
  registrarBuscaPreco,
  buscarHistorico,
  jaProcessouMensagem,
  marcarMensagemProcessada
} from '../lib/supabase.js';
import { chamarClaude, analisarFoto, buscarPrecosIA, transcreverAudio } from '../lib/claude.js';
import { enviarMensagem } from '../lib/zapi.js';

// ⚙️ Aumenta timeout do Vercel pra 60s (suficiente pra Claude responder)
export const config = {
  maxDuration: 60,
};

const boasVindasEnviadas = new Map();
const TEMPO_SESSAO = 8 * 60 * 60 * 1000;

function jaEnviouBoasVindas(t) { const ts = boasVindasEnviadas.get(t); return ts && Date.now() - ts < TEMPO_SESSAO; }
function marcarBoasVindas(t) { boasVindasEnviadas.set(t, Date.now()); }

function isOla(msg) {
  return ['oi','olá','ola','oi!','olá!','menu','inicio','início','começar','comecar','start','bom dia','boa tarde','boa noite'].includes(msg.toLowerCase().trim());
}
function ehCalculo(msg) {
  return /\b(calcul|dimens|corrente|queda.*tens|disjuntor|cabo\s*(para|de|mm)|motor|chuveiro|transformador|potência|capacitor|iluminância|\d+\s*(kva|kw|cv|hp|w)|\d+\s*v\s*(tri|mono|bi))\b/i.test(msg);
}
function ehPerguntaTecnica(msg) {
  return /\b(o\s*que\s*é|como\s*(funciona|fazer|instalar|ligar)|qual\s*(a\s*)?(diferença|norma|regra)|quando\s*usar|posso\s*usar|é\s*obrigatório|explica|me\s*fala|diferença\s*entre|para\s*que\s*serve)\b/i.test(msg);
}
function ehConversao(msg) {
  return /\b(convert(er|e|a)|transforma(r)?|quanto\s*é|em\s*(watts?|kw|cv|hp|volts?|amperes?|hz|rpm|°c|°f|kelvin|awg|mm²)|de\s*(cv|hp|kw|mw|kva|kwh|v|a|hz|rpm|°c|°f)\s*para)\b/i.test(msg);
}
function ehMaterial(msg) {
  return /\b(material|lista de material|orcamento|orçamento|lista de materiais|projeto.*material|material.*projeto)\b/i.test(msg);
}
function ehOutraNorma(msg) {
  return /\b(nr-10|nr10|nr-12|nr12|nr-33|nr33|nr-35|nr35|nbr\s*5419|nbr5419|nbr\s*5413|nbr5413|nbr\s*14039|nbr14039)\b/i.test(msg);
}

const BOAS_VINDAS_GRATIS = `🆓 *5 cálculos grátis/dia*\n\n⚡ IA ESPECIALIZADA EM ELÉTRICA\n \n🏅 Desenvolvida por Engenheiro (CREA)\n \n⚠️ Não substitui projeto técnico com ART quando exigido.\n \n👇 Como posso te ajudar?`;
const BOAS_VINDAS_PRO = `⚡ *PRO ativo — ilimitado*\n\nOi! Que bom que você está aqui 👷\n\nCálculos ilimitados, diagnóstico, normas e análise de fotos!\n\n💡 Quer projeto detalhado, materiais com preços e suporte?\n👑 *PREMIUM R$39,99/mês*: https://pay.kiwify.com.br/9SShnKM`;
const BOAS_VINDAS_PREMIUM = `👑 *PREMIUM — nível engenheiro*\n\nOi! Ótimo ter você aqui 👷\n\nAcesso total — cálculos, projetos, fotos, materiais com preços e suporte!\n\n✅ Acesso total liberado — sem limites!`;

const MSG_LIMITE_CALCULOS = `⚠️ Você atingiu o limite de *5 cálculos diários* do plano gratuito.\n\nPara continuar sem limites:\n\n💳 *Planos Engenheiro Eletricista AI*\n\n━━━━━━━━━━━━━━━\n🆓 *GRÁTIS — R$0*\n• 5 cálculos/dia · 5 perguntas/dia\n• NBR 5410 incluída\n\n━━━━━━━━━━━━━━━\n⚡ *PRO — R$19,99/mês*\n• Cálculos ilimitados\n• Diagnóstico automático\n• Normas completas\n• Análise de fotos (20/dia)\n👉 https://pay.kiwify.com.br/3klvFH6\n\n━━━━━━━━━━━━━━━\n👑 *PREMIUM — R$39,99/mês*\n• Tudo do PRO\n• Lista de materiais com preços\n• Projeto detalhado\n• Histórico completo\n• Análise de fotos ilimitada\n• Suporte especialista\n• Garantia 7 dias 🔒\n👉 https://pay.kiwify.com.br/9SShnKM`;

const MSG_LIMITE_PERGUNTAS = `⚠️ Você atingiu o limite de *5 perguntas técnicas diárias* do plano gratuito.\n\n⚡ PRO: https://pay.kiwify.com.br/3klvFH6\n👑 PREMIUM: https://pay.kiwify.com.br/9SShnKM`;
const MSG_NORMA_BLOQUEADA = `📋 Outras normas disponíveis nos planos *PRO* e *PREMIUM*.\n\nNo grátis: *NBR 5410* incluída.\n\n⚡ PRO: https://pay.kiwify.com.br/3klvFH6\n👑 PREMIUM: https://pay.kiwify.com.br/9SShnKM`;
const MSG_PLANOS = `💳 *Planos Engenheiro Eletricista AI*\n\n━━━━━━━━━━━━━━━\n🆓 *GRÁTIS — R$0*\n• 5 cálculos/dia · 5 perguntas/dia\n• NBR 5410 incluída · Acesso 24h\n\n━━━━━━━━━━━━━━━\n⚡ *PRO — R$19,99/mês*\n• Cálculos ilimitados\n• Diagnóstico automático\n• Normas completas\n• Análise de fotos (20/dia)\n👉 https://pay.kiwify.com.br/3klvFH6\n\n━━━━━━━━━━━━━━━\n👑 *PREMIUM — R$39,99/mês*\n• Tudo do PRO\n• Lista de materiais com preços atualizados\n• Projeto elétrico detalhado\n• Histórico completo\n• Análise de fotos ilimitada\n• Suporte com especialista\n• Garantia 7 dias 🔒\n👉 https://pay.kiwify.com.br/9SShnKM\n━━━━━━━━━━━━━━━`;

// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL — processa SINCRONICAMENTE com await
// Z-API espera resposta 200 dentro de ~30s. Vercel tem 60s.
// ═══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;

    if (body.fromMe || body.isGroup) {
      return res.status(200).json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════
    // 🛡️ DEDUPLICAÇÃO ROBUSTA
    // ═══════════════════════════════════════════════════════════

    const messageId = body.messageId || body.id || body.message?.id || body.key?.id;

    if (!messageId) {
      console.warn('[WEBHOOK] Mensagem sem ID — body keys:', Object.keys(body || {}));
      return res.status(200).json({ ok: true });
    }

    const jaProcessou = await jaProcessouMensagem(messageId);
    if (jaProcessou) {
      console.log(`[DEDUP] ${messageId} já processada — ignorando`);
      return res.status(200).json({ ok: true, dedup: true });
    }

    await marcarMensagemProcessada(messageId);

    // ═══════════════════════════════════════════════════════════
    // ⚙️ DETECÇÃO DE TIPO (texto / áudio / imagem)
    // ═══════════════════════════════════════════════════════════

    const telefone = body.phone?.replace(/\D/g, '');
    const nome = body.senderName || 'Usuário';
    const temImagem = !!(body.image || body.imageMessage);
    const temAudio = !!(body.audio || body.audioMessage);

    let mensagem = (body.text?.message || body.caption || '').trim();

    // ═══ TRANSCRIÇÃO DE ÁUDIO ═══
    if (temAudio && !mensagem) {
      try {
        const audioUrl = body.audio?.audioUrl || body.audioMessage?.url;
        const audioBase64 = body.audio?.base64 || body.audioMessage?.base64;
        const mimeType = body.audio?.mimeType || 'audio/ogg';

        let audioBuffer;
        if (audioBase64) {
          audioBuffer = Buffer.from(audioBase64, 'base64');
        } else if (audioUrl) {
          const audioRes = await fetch(audioUrl);
          audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        } else {
          throw new Error('Áudio sem URL ou base64');
        }

        console.log('[AUDIO] Transcrevendo áudio...');
        mensagem = await transcreverAudio(audioBuffer, mimeType);
        console.log('[AUDIO] Transcrição:', mensagem);

      } catch (err) {
        console.error('[ERRO AUDIO]', err);
        await enviarMensagem(telefone, `Não consegui entender o áudio. Pode digitar a pergunta?`);
        return res.status(200).json({ ok: true });
      }
    }

    if (!telefone || (!mensagem && !temImagem)) {
      return res.status(200).json({ ok: true });
    }

    const usuario = await verificarOuCriarUsuario(telefone, nome);
    const plano = usuario?.plano || 'gratis';

    // ═══ FOTO ═══
    if (temImagem) {
      const limFoto = await verificarLimiteFotos(telefone, plano);
      if (!limFoto.permitido) {
        const msg = plano === 'gratis'
          ? `📸 Análise de fotos disponível nos planos *PRO* e *PREMIUM*.\n\n⚡ PRO: https://pay.kiwify.com.br/3klvFH6\n👑 PREMIUM: https://pay.kiwify.com.br/9SShnKM`
          : `⚠️ Limite de *20 fotos diárias* do PRO atingido.\n\n👑 PREMIUM tem fotos ilimitadas!\n👉 https://pay.kiwify.com.br/9SShnKM`;
        await enviarMensagem(telefone, msg);
        return res.status(200).json({ ok: true });
      }
      try {
        const imagemUrl = body.image?.imageUrl || body.imageMessage?.url;
        const imagemBase64 = body.image?.base64 || body.imageMessage?.base64;
        const mimeType = body.image?.mimeType || 'image/jpeg';
        let base64 = imagemBase64;
        if (!base64 && imagemUrl) {
          const imgRes = await fetch(imagemUrl);
          base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
        }
        const resposta = await analisarFoto(telefone, base64, mimeType, plano);
        await registrarFoto(telefone);
        await registrarConversa(telefone, '[foto]', 'usuario');
        await registrarConversa(telefone, resposta, 'agente');
        await enviarMensagem(telefone, resposta);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[ERRO FOTO]', err);
        await enviarMensagem(telefone, `Não consegui analisar a foto. Tente novamente! 😊`);
        return res.status(200).json({ ok: true });
      }
    }

    // Registra conversa (com flag de áudio se aplicável)
    const prefixoAudio = temAudio ? '[áudio] ' : '';
    await registrarConversa(telefone, prefixoAudio + mensagem, 'usuario');
    const msg = mensagem.toLowerCase().trim();

    // ═══ BOAS-VINDAS ═══
    if (isOla(mensagem)) {
      if (!jaEnviouBoasVindas(telefone)) {
        marcarBoasVindas(telefone);
        const texto = plano === 'premium' ? BOAS_VINDAS_PREMIUM : plano === 'pro' ? BOAS_VINDAS_PRO : BOAS_VINDAS_GRATIS;
        await enviarMensagem(telefone, texto);
        await registrarConversa(telefone, texto, 'agente');
      }
      return res.status(200).json({ ok: true });
    }

    // ═══ HISTÓRICO ═══
    if (/^(histórico|historico|meus cálculos|meus calculos)$/.test(msg)) {
      if (plano !== 'premium') {
        await enviarMensagem(telefone, `Histórico disponível no plano *PREMIUM*.\n\n👑 https://pay.kiwify.com.br/9SShnKM`);
        return res.status(200).json({ ok: true });
      }
      const historico = await buscarHistorico(telefone, 10);
      if (!historico.length) {
        await enviarMensagem(telefone, `Você ainda não realizou nenhum cálculo! 😊`);
        return res.status(200).json({ ok: true });
      }
      let resp = `📋 *Seus últimos ${historico.length} cálculos:*\n\n`;
      historico.forEach((c, i) => { resp += `${i+1}. *${c.tipo_calculo||'Cálculo'}* — ${new Date(c.realizado_em).toLocaleDateString('pt-BR')}\n`; });
      await enviarMensagem(telefone, resp);
      await registrarConversa(telefone, resp, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ PLANOS ═══
    if (/\b(ver planos|quero assinar|assinar plano|assinar|upgrade|quanto custa|contratar)\b/i.test(msg)) {
      await enviarMensagem(telefone, MSG_PLANOS);
      await registrarConversa(telefone, MSG_PLANOS, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ NORMA BLOQUEADA ═══
    if (plano === 'gratis' && ehOutraNorma(msg)) {
      await enviarMensagem(telefone, MSG_NORMA_BLOQUEADA);
      await registrarConversa(telefone, MSG_NORMA_BLOQUEADA, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ MATERIAIS COM PREÇOS (PREMIUM) ═══
    if (ehMaterial(msg)) {
      if (plano === 'premium') {
        const limite = await verificarLimiteBuscaPreco(telefone);
        if (!limite.permitido) {
          await enviarMensagem(telefone, `⚠️ Limite de *7 buscas de preços diárias* atingido.\n\nTente novamente amanhã!`);
          return res.status(200).json({ ok: true });
        }
        try {
          const resposta = await buscarPrecosIA(telefone, mensagem, plano);
          await registrarBuscaPreco(telefone);
          await registrarConversa(telefone, resposta, 'agente');
          await enviarMensagem(telefone, resposta);
          return res.status(200).json({ ok: true });
        } catch {
          await enviarMensagem(telefone, `Não consegui buscar preços agora. Tente novamente! 😊`);
          return res.status(200).json({ ok: true });
        }
      } else {
        const resposta = await chamarClaude(telefone, mensagem + '\n[Gerar lista de materiais SEM preços — plano grátis/PRO]', plano);
        await registrarConversa(telefone, resposta, 'agente');
        await enviarMensagem(telefone, resposta);
        return res.status(200).json({ ok: true });
      }
    }

    // ═══ CONVERSÕES ═══
    if (ehConversao(msg)) {
      const resposta = await chamarClaude(telefone, mensagem, plano);
      await registrarConversa(telefone, resposta, 'agente');
      await enviarMensagem(telefone, resposta);
      return res.status(200).json({ ok: true });
    }

    // ═══ CÁLCULOS ═══
    if (ehCalculo(msg)) {
      if (plano === 'gratis') {
        const limite = await verificarLimiteCalculos(telefone);
        if (!limite.permitido) {
          await enviarMensagem(telefone, MSG_LIMITE_CALCULOS);
          await registrarConversa(telefone, MSG_LIMITE_CALCULOS, 'agente');
          return res.status(200).json({ ok: true });
        }
      }
      const resposta = await chamarClaude(telefone, mensagem, plano);
      await registrarCalculo(telefone, 'calculo', { mensagem }, { resposta });
      await registrarConversa(telefone, resposta, 'agente');
      await enviarMensagem(telefone, resposta);
      return res.status(200).json({ ok: true });
    }

    // ═══ PERGUNTAS TÉCNICAS ═══
    if (plano === 'gratis' && ehPerguntaTecnica(msg)) {
      const limite = await verificarLimitePerguntas(telefone);
      if (!limite.permitido) {
        await enviarMensagem(telefone, MSG_LIMITE_PERGUNTAS);
        await registrarConversa(telefone, MSG_LIMITE_PERGUNTAS, 'agente');
        return res.status(200).json({ ok: true });
      }
      await registrarPergunta(telefone, mensagem);
    }

    // ═══ IA RESPONDE ═══
    const resposta = await chamarClaude(telefone, mensagem, plano);
    await registrarConversa(telefone, resposta, 'agente');
    await enviarMensagem(telefone, resposta);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[ERRO WEBHOOK]', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
}
