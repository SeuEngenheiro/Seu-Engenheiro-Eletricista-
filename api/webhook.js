import { verificarOuCriarUsuario, verificarLimiteCalculos, verificarLimitePerguntas, registrarCalculo, registrarConversa, buscarHistorico } from '../lib/supabase.js';
import { chamarClaude, analisarFoto } from '../lib/claude.js';
import { enviarMensagem } from '../lib/zapi.js';

// Controle de boas-vindas (não repetir na mesma sessão)
const boasVindasEnviadas = new Map();
const mensagensProcessadas = new Map();
const TEMPO_SESSAO = 8 * 60 * 60 * 1000; // 8 horas

function jaEnviouBoasVindas(telefone) {
  const ts = boasVindasEnviadas.get(telefone);
  if (!ts || Date.now() - ts > TEMPO_SESSAO) return false;
  return true;
}

function marcarBoasVindas(telefone) {
  boasVindasEnviadas.set(telefone, Date.now());
}

function isOla(msg) {
  const v = msg.toLowerCase().trim();
  return ['oi','olá','ola','oi!','olá!','menu','inicio','início','começar','comecar','start','bom dia','boa tarde','boa noite'].includes(v);
}

// Detecta se é um CÁLCULO (consome limite de cálculos)
function ehCalculo(msg) {
  return /\b(calcul(ar|ei|ou|ando|a|e)|dimens(ion|ionar|ionamento)|quanto(s)?\s*(amp|a\b|v\b)|corrente\s*(de|do|da|motor|transf|cabo|circuito)|queda\s*(de\s*)?tens|potência\s*(de|do|da)|disjuntor\s*(para|de|do)|cabo\s*(para|de|do|mm)|seção\s*(do|de|para)\s*cabo|fator\s*de\s*potência|banco\s*de\s*capacitor|iluminância|lux|motor\s*de\s*\d|chuveiro\s*de\s*\d|transformador\s*de\s*\d|\d+\s*(kva|kw|cv|hp|w)\s*(em|para|no?)\s*\d|\d+\s*v\s*(trifásico|monofásico|bifásico))\b/i.test(msg);
}

// Detecta se é uma PERGUNTA TÉCNICA (consome limite de perguntas)
function ehPerguntaTecnica(msg) {
  return /\b(o\s*que\s*é|como\s*(funciona|fazer|instalar|ligar|calcular)|qual\s*(a\s*)?(diferença|norma|regra|exigência)|quando\s*usar|posso\s*usar|é\s*obrigatório|explica|me\s*fala|me\s*explica|diferença\s*entre|para\s*que\s*serve|como\s*identificar|devo\s*usar)\b/i.test(msg);
}

// Detecta CONVERSÃO (não consome limite)
function ehConversao(msg) {
  return /\b(convert(er|e|a)|transforma(r)?|quanto\s*é|em\s*(watts?|kw|cv|hp|volts?|amperes?|hz|rpm|°c|°f|kelvin|awg|mm²)|de\s*(cv|hp|kw|mw|kva|kwh|v|a|hz|rpm|°c|°f)\s*para|em\s*\d+\s*(kv|mv|µv))\b/i.test(msg);
}

// Detecta NORMA (não consome limite no grátis para NBR 5410)
function ehConsultaNorma(msg) {
  return /\b(nbr|nr-|nr\s*\d|abnt|norma|regulamento)\b/i.test(msg);
}

function ehOutraNorma(msg) {
  return /\b(nr-10|nr10|nr-12|nr12|nr-33|nr33|nr-35|nr35|nbr\s*5419|nbr5419|nbr\s*5413|nbr5413|nbr\s*14039|nbr14039|nbr\s*7286|nbr7286|nbr\s*7287|nbr7287)\b/i.test(msg);
}

const BOAS_VINDAS_GRATIS = `🆓 *5 cálculos grátis/dia*\n\n⚡ IA ESPECIALIZADA EM ELÉTRICA\n \n🏅 Desenvolvida por Engenheiro (CREA)\n \n⚠️ Não substitui projeto técnico com ART quando exigido.\n \n👇 Como posso te ajudar?`;

const BOAS_VINDAS_PRO = `⚡ *PRO ativo — ilimitado*\n\nOi! Que bom que você está aqui 👷\n\nPode mandar sua dúvida — cálculos ilimitados, diagnóstico e normas completas!\n\n💡 Quer projeto detalhado, materiais e suporte humano?\n👑 *PREMIUM R$39,90/mês*: https://pay.kiwify.com.br/9SShnKM`;

const BOAS_VINDAS_PREMIUM = `👑 *PREMIUM — nível engenheiro*\n\nOi! Ótimo ter você aqui 👷\n\nVocê tem o melhor plano disponível. Me manda qualquer dúvida — cálculo, projeto, material ou suporte especializado!\n\n✓ Tudo liberado · ✓ Sem limites · ✓ Suporte humano\n\n✅ Acesso total liberado — sem limites!`;

const MSG_LIMITE_CALCULOS = `⚠️ Você atingiu o limite de *5 cálculos diários* do plano gratuito.\n\nPara continuar calculando sem limites:\n\n⚡ *PRO — R$19,90/mês*\n• Cálculos ilimitados\n• Diagnóstico automático\n• Normas completas\n👉 https://pay.kiwify.com.br/3klvFH6\n\n👑 *PREMIUM — R$39,90/mês*\n• Tudo do PRO + projetos + materiais + suporte\n👉 https://pay.kiwify.com.br/9SShnKM`;

const MSG_LIMITE_PERGUNTAS = `⚠️ Você atingiu o limite de *5 perguntas técnicas diárias* do plano gratuito.\n\nPara continuar sem limites:\n\n⚡ *PRO — R$19,90/mês*\n👉 https://pay.kiwify.com.br/3klvFH6\n\n👑 *PREMIUM — R$39,90/mês*\n👉 https://pay.kiwify.com.br/9SShnKM`;

const MSG_NORMA_BLOQUEADA = `📋 Consulta a outras normas está disponível nos planos *PRO* e *PREMIUM*.\n\nNo plano grátis você tem acesso à *NBR 5410*.\n\n⚡ PRO: https://pay.kiwify.com.br/3klvFH6\n👑 PREMIUM: https://pay.kiwify.com.br/9SShnKM`;

const MSG_PLANOS = `💳 *Planos Engenheiro Eletricista AI*\n\n━━━━━━━━━━━━━━━\n🆓 *GRÁTIS — R$0*\n• Até 5 cálculos elétricos por dia\n• Até 5 perguntas técnicas por dia\n• Consulta à NBR 5410 incluída\n• Acesso 24h via WhatsApp\n\n━━━━━━━━━━━━━━━\n⚡ *PRO — R$19,90/mês*\n• Cálculos ilimitados\n• Dimensionamento completo\n• Diagnóstico automático\n• Normas técnicas completas\n• IA técnica 24h\n👉 https://pay.kiwify.com.br/3klvFH6\n\n━━━━━━━━━━━━━━━\n👑 *PREMIUM — R$39,90/mês*\n• Tudo do PRO\n• Lista de materiais com preços\n• Projeto elétrico detalhado\n• Histórico completo\n• Suporte com especialista\n• Garantia 7 dias 🔒\n👉 https://pay.kiwify.com.br/9SShnKM\n━━━━━━━━━━━━━━━`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    if (body.fromMe) return res.status(200).json({ ok: true });
    if (body.isGroup) return res.status(200).json({ ok: true });

    const telefone = body.phone?.replace(/\D/g, '');
    const mensagem = (body.text?.message || body.caption || '').trim();
    const nome = body.senderName || 'Usuário';

    console.log('[WEBHOOK]', telefone, '|', mensagem.slice(0,30), '|', Object.keys(body).join(','));
    if (!telefone || !mensagem) return res.status(200).json({ ok: true });

    // Evitar duplicação
    const msgId = `${telefone}-${mensagem.slice(0,20)}-${Math.floor(Date.now()/3000)}`;
    if (mensagensProcessadas.has(msgId)) return res.status(200).json({ ok: true });
    mensagensProcessadas.set(msgId, true);
    setTimeout(() => mensagensProcessadas.delete(msgId), 10000);

    const usuario = await verificarOuCriarUsuario(telefone, nome);

    console.log('[ZAPI BODY]', JSON.stringify(Object.keys(body)));
    if(body.image) console.log('[IMAGE]', JSON.stringify(body.image).slice(0,200));
    // ═══ ANÁLISE DE FOTO ═══
    const imagemUrl = body.image?.imageUrl || body.imageMessage?.url;
    const imagemBase64 = body.image?.base64 || body.imageMessage?.base64;
    const mimeType = body.image?.mimeType || 'image/jpeg';

    if (imagemBase64 || imagemUrl) {
      const limFoto = await verificarLimiteFotos(telefone, plano);
      if (!limFoto.permitido) {
        if (plano === 'gratis') {
          await enviarMensagem(telefone, `📸 Análise de fotos está disponível nos planos *PRO* e *PREMIUM*.

⚡ PRO: https://pay.kiwify.com.br/3klvFH6
👑 PREMIUM: https://pay.kiwify.com.br/9SShnKM`);
        } else {
          await enviarMensagem(telefone, `⚠️ Você atingiu o limite de *20 fotos diárias* do plano PRO.

👑 No PREMIUM as análises são ilimitadas!
👉 https://pay.kiwify.com.br/9SShnKM`);
        }
        return res.status(200).json({ ok: true });
      }

      try {
        let base64 = imagemBase64;
        if (!base64 && imagemUrl) {
          const imgRes = await fetch(imagemUrl);
          const buffer = await imgRes.arrayBuffer();
          base64 = Buffer.from(buffer).toString('base64');
        }
        const resposta = await analisarFoto(telefone, base64, mimeType, plano);
        await registrarFoto(telefone);
        await registrarConversa(telefone, '[foto]', 'usuario');
        await registrarConversa(telefone, resposta, 'agente');
        await enviarMensagem(telefone, resposta);
        return res.status(200).json({ ok: true });
      } catch (err) {
        await enviarMensagem(telefone, `Não consegui analisar a foto. Tente enviar novamente! 😊`);
        return res.status(200).json({ ok: true });
      }
    }

    await registrarConversa(telefone, mensagem, 'usuario');

    const msg = mensagem.toLowerCase().trim();
    const plano = usuario?.plano || 'gratis';

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
        await enviarMensagem(telefone, `Histórico de cálculos está disponível no plano *PREMIUM*.\n\n👑 https://pay.kiwify.com.br/9SShnKM`);
        return res.status(200).json({ ok: true });
      }
      const historico = await buscarHistorico(telefone, 10);
      if (!historico.length) {
        await enviarMensagem(telefone, `Você ainda não realizou nenhum cálculo. Me manda sua dúvida! 😊`);
        return res.status(200).json({ ok: true });
      }
      let resp = `📋 *Seus últimos ${historico.length} cálculos:*\n\n`;
      historico.forEach((c, i) => {
        const data = new Date(c.realizado_em).toLocaleDateString('pt-BR');
        const hora = new Date(c.realizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        resp += `${i + 1}. *${c.tipo_calculo || 'Cálculo'}* — ${data} às ${hora}\n`;
      });
      await enviarMensagem(telefone, resp);
      await registrarConversa(telefone, resp, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ PLANOS ═══
    if (/\b(planos?|assinar|upgrade|preço|preco|quanto custa|contratar|ver planos)\b/i.test(msg)) {
      await enviarMensagem(telefone, MSG_PLANOS);
      await registrarConversa(telefone, MSG_PLANOS, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ NORMA BLOQUEADA NO GRÁTIS ═══
    if (plano === 'gratis' && ehOutraNorma(msg)) {
      await enviarMensagem(telefone, MSG_NORMA_BLOQUEADA);
      await registrarConversa(telefone, MSG_NORMA_BLOQUEADA, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ CONVERSÕES — não consomem limite ═══
    if (ehConversao(msg)) {
      const resposta = await chamarClaude(telefone, mensagem, plano);
      await registrarConversa(telefone, resposta, 'agente');
      await enviarMensagem(telefone, resposta);
      return res.status(200).json({ ok: true });
    }

    // ═══ CÁLCULOS — verificar limite ═══
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

    // ═══ PERGUNTAS TÉCNICAS — verificar limite ═══
    if (plano === 'gratis' && ehPerguntaTecnica(msg)) {
      const limite = await verificarLimitePerguntas(telefone);
      if (!limite.permitido) {
        await enviarMensagem(telefone, MSG_LIMITE_PERGUNTAS);
        await registrarConversa(telefone, MSG_LIMITE_PERGUNTAS, 'agente');
        return res.status(200).json({ ok: true });
      }
    }

    // ═══ IA RESPONDE ═══
    const resposta = await chamarClaude(telefone, mensagem, plano);
    await registrarConversa(telefone, resposta, 'agente');
    await enviarMensagem(telefone, resposta);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('erro do webhook', err);
    return res.status(500).json({ error: err.message });
  }
}
