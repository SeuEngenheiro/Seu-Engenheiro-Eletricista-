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

const BOAS_VINDAS_GRATIS = `👷‍♂️⚡ Olá! Eu sou o SEU ENGENHEIRO AI\n\nPosso te ajudar com qualquer dúvida ou problema elétrico, sempre seguindo as normas (NBR 5410 / NR-10).\n\n🟢 *Plano Gratuito:* 20 perguntas/mês\n\nO que você precisa?`;
const BOAS_VINDAS_PRO = `⚡ *PROFISSIONAL ativo — ilimitado*\n\nOi! Que bom que você está aqui 👷\n\nPerguntas ilimitadas, cálculo passo a passo e lista de materiais!\n\n💡 Quer fotos, preços atualizados e análise de projeto?\n🔴 *PREMIUM R$ 49,99/mês*: https://pay.kiwify.com.br/Mns2lfH`;
const BOAS_VINDAS_PREMIUM = `🔴 *PREMIUM — nível engenheiro*\n\nOi! Ótimo ter você aqui 👷\n\nAcesso total — cálculos, projetos, fotos, preços atualizados, histórico e suporte!\n\n✅ Acesso total liberado — sem limites!`;

const MSG_LIMITE_CALCULOS = `⚠️ Você atingiu o limite de *20 perguntas/mês* do plano gratuito.\n\nPra continuar sem limites:\n\n📊 *Planos — Seu Engenheiro AI*\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔵 *Plano Profissional — R$ 24,99/mês*\n• Perguntas ilimitadas\n• Cálculos ilimitados\n• Dimensionamento detalhado\n• Lista de materiais (SEM PREÇOS)\n• Especificação técnica de materiais\n👉 https://pay.kiwify.com.br/mVAGqLU\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔴 *Plano Premium — R$ 49,99/mês*\n• Tudo do Profissional\n• 💰 Lista de materiais (COM PREÇOS)\n• 📷 Análise de fotos ilimitada\n• 📜 Histórico completo acessível\n• 🏗️ Análise de projeto (fotos + planta)\n👉 https://pay.kiwify.com.br/Mns2lfH\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Pronto pra começar? Assine um plano agora.`;

const MSG_LIMITE_PERGUNTAS = `⚠️ Você atingiu o limite de *20 perguntas/mês* do plano gratuito.\n\n🔵 PROFISSIONAL: https://pay.kiwify.com.br/mVAGqLU\n🔴 PREMIUM: https://pay.kiwify.com.br/Mns2lfH`;
const MSG_NORMA_BLOQUEADA = `📋 Outras normas disponíveis nos planos *PROFISSIONAL* e *PREMIUM*.\n\nNo grátis: *NBR 5410* incluída.\n\n🔵 PROFISSIONAL: https://pay.kiwify.com.br/mVAGqLU\n🔴 PREMIUM: https://pay.kiwify.com.br/Mns2lfH`;
const MSG_PLANOS = `📊 *Planos — Seu Engenheiro AI*\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🟢 *Plano Gratuito — R$ 0*\n• 20 perguntas / mês\n• Resposta técnica padrão (modo curto)\n• Direcionamento conforme NBR 5410\n\nIndicado pra dúvidas simples e consultas rápidas.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔵 *Plano Profissional — R$ 24,99/mês*\n• Perguntas ilimitadas\n• Cálculos ilimitados\n• Dimensionamento detalhado\n• Lista de materiais (SEM PREÇOS)\n• Especificação técnica de materiais\n\nIndicado pra quem executa serviços.\n\n👉 https://pay.kiwify.com.br/mVAGqLU\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔴 *Plano Premium — R$ 49,99/mês*\n• Tudo do Profissional\n• 💰 Lista de materiais (COM PREÇOS)\n• 📷 Análise de fotos ilimitada\n• 📜 Histórico completo acessível\n• 🏗️ Análise de projeto (fotos + planta)\n\nIndicado pra uso profissional e projetos.\n\n👉 https://pay.kiwify.com.br/Mns2lfH\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Pronto pra começar? Assine um plano agora.`;

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
        const msg = plano !== 'premium'
          ? `📸 Análise de fotos disponível APENAS no plano *PREMIUM*.\n\n🔴 PREMIUM (R$ 49,99/mês): https://pay.kiwify.com.br/Mns2lfH`
          : `⚠️ Limite de *30 fotos diárias* do PREMIUM atingido.\n\nVolte amanhã ou aguarde o reset à meia-noite.`;
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
        await enviarMensagem(telefone, `Histórico disponível no plano *PREMIUM*.\n\n🔴 https://pay.kiwify.com.br/Mns2lfH`);
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
    if (/\b(planos?|ver\s+planos|valores|pre[çc]os?|quanto\s+custa|qual\s+o\s+(valor|pre[çc]o)|quero\s+assinar|assinar(\s+plano)?|upgrade|contratar|fazer\s+upgrade)\b/i.test(msg)) {
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
