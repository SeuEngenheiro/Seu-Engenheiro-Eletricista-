import { verificarOuCriarUsuario, verificarLimiteCalculos, registrarCalculo, registrarConversa, buscarHistorico } from '../lib/supabase.js';
import { chamarClaude } from '../lib/claude.js';
import { enviarMensagem } from '../lib/zapi.js';

// Controle de boas-vindas (não repetir na mesma sessão)
const boasVindasEnviadas = new Map();
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    if (body.fromMe) return res.status(200).json({ ok: true });
    if (body.isGroup) return res.status(200).json({ ok: true });

    const telefone = body.phone?.replace(/\D/g, '');
    const mensagem = (body.text?.message || body.caption || '').trim();
    const nome = body.senderName || 'Usuário';

    if (!telefone || !mensagem) return res.status(200).json({ ok: true });

    const usuario = await verificarOuCriarUsuario(telefone, nome);
    await registrarConversa(telefone, mensagem, 'usuario');

    const msg = mensagem.toLowerCase().trim();

    // ═══ BOAS-VINDAS POR PLANO ═══
    if (isOla(mensagem) || !jaEnviouBoasVindas(telefone)) {
      marcarBoasVindas(telefone);
      const plano = usuario?.plano || 'gratis';

      if (plano === 'premium') {
        const texto = `👑 *PREMIUM — nível engenheiro*\n\nOi! Ótimo ter você aqui 👷\n\nVocê tem o melhor plano disponível. Me manda qualquer dúvida — cálculo, projeto, material ou suporte especializado!\n\n✓ Tudo liberado · ✓ Sem limites · ✓ Suporte humano\n\n✅ Acesso total liberado — sem limites!`;
        await enviarMensagem(telefone, texto);

      } else if (plano === 'pro') {
        const texto = `⚡ *PRO ativo — ilimitado*\n\nOi! Que bom que você está aqui 👷\n\nPode mandar sua dúvida — cálculos ilimitados, diagnóstico e normas completas!\n\n💡 Quer o pacote completo com projeto detalhado, materiais e suporte humano?\n\n👑 PREMIUM por R$39,90/mês\n👉 https://pay.kiwify.com.br/9SShnKM`;

        await enviarMensagem(telefone, texto);

      } else {
        // Grátis / novo usuário
        const texto = `🆓 *5 cálculos grátis/dia*\n\n⚡ IA ESPECIALIZADA EM ELÉTRICA\n \n🏅 Desenvolvida por Engenheiro (CREA)\n \n⚠️ Não substitui projeto técnico com ART quando exigido.\n \n👇 Como posso te ajudar?`;

        await enviarMensagem(telefone, texto);
      }

      await registrarConversa(telefone, 'boas-vindas enviadas', 'agente');
      if (isOla(mensagem)) return res.status(200).json({ ok: true });
    }

    // ═══ BOTÕES CLICADOS ═══
    const buttonId = body.buttonResponseMessage?.selectedButtonId || body.listResponseMessage?.singleSelectReply?.selectedRowId;

    if (buttonId === 'assinar_pro') {
      await enviarMensagem(telefone, `⚡ Ótimo! Acesse o link para assinar o *Plano PRO*:\n👉 https://pay.kiwify.com.br/3klvFH6\n\nPIX, cartão ou boleto · Acesso imediato ✅\nGarantia de 7 dias 🔒`);
      return res.status(200).json({ ok: true });
    }
    if (buttonId === 'assinar_premium' || buttonId === 'upgrade_premium') {
      await enviarMensagem(telefone, `👑 Ótimo! Acesse o link para assinar o *Plano PREMIUM*:\n👉 https://pay.kiwify.com.br/9SShnKM\n\nPIX, cartão ou boleto · Acesso imediato ✅\nGarantia de 7 dias 🔒`);
      return res.status(200).json({ ok: true });
    }
    if (buttonId === 'continuar_gratis') {
      await enviarMensagem(telefone, `Perfeito! Me manda sua dúvida elétrica 😊`);
      return res.status(200).json({ ok: true });
    }

    // ═══ COMANDO HISTÓRICO ═══
    if (msg === 'histórico' || msg === 'historico' || msg === 'meus cálculos' || msg === 'meus calculos') {
      if (usuario.plano === 'gratis' || usuario.plano === 'pro') {
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

    // ═══ PLANOS — responder a qualquer momento ═══
    const perguntaPlano = /plano|pro|premium|diferença|diferenca|assinar|upgrade|preço|preco|quanto custa|valor|contratar/i.test(msg);
    if (perguntaPlano) {
      const msgPlanos = `💳 *Planos Engenheiro Eletricista AI*

━━━━━━━━━━━━━━━
🆓 *GRÁTIS — R$0*
• 5 cálculos por dia
• Dúvidas técnicas ilimitadas
• Consulta básica de normas
• Acesso 24h via WhatsApp

━━━━━━━━━━━━━━━
⚡ *PRO — R$19,90/mês*
• Cálculos ilimitados
• Dimensionamento completo
• Diagnóstico automático
• Normas técnicas completas
• IA técnica 24h
👉 https://pay.kiwify.com.br/3klvFH6

━━━━━━━━━━━━━━━
👑 *PREMIUM — R$39,90/mês*
• Tudo do PRO
• Lista de materiais com preços
• Projeto elétrico detalhado
• Histórico completo
• Suporte com especialista
• Garantia 7 dias 🔒
👉 https://pay.kiwify.com.br/9SShnKM
━━━━━━━━━━━━━━━`;
      await enviarMensagem(telefone, msgPlanos);
      await registrarConversa(telefone, msgPlanos, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ VERIFICAR LIMITE ═══
    const limite = await verificarLimiteCalculos(telefone);
    if (!limite.permitido) {
      const msgLimite = `⚠️ Você atingiu o limite de *5 cálculos diários* do plano gratuito.\n\n Para continuar calculando sem limites, conheça nossos planos:\n\n━━━━━━━━━━━━━━━\n⚡ *PRO — R$19,90/mês*\nIdeal para eletricistas que usam todo dia\n• Cálculos ilimitados\n• Dimensionamento completo\n• Diagnóstico automático\n• Normas técnicas completas\n• IA técnica 24h\n👉 https://pay.kiwify.com.br/3klvFH6\n\n━━━━━━━━━━━━━━━\n👑 *PREMIUM — R$39,90/mês*\nNível engenheiro completo\n• Tudo do PRO\n• Lista de materiais com preços\n• Projeto elétrico detalhado\n• Histórico completo\n• Suporte com especialista\n• Garantia 7 dias 🔒\n👉 https://pay.kiwify.com.br/9SShnKM\n━━━━━━━━━━━━━━━`;
      await enviarMensagem(telefone, msgLimite);
      await registrarConversa(telefone, msgLimite, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ IA RESPONDE ═══
    const resposta = await chamarClaude(telefone, mensagem, usuario.plano);

    const ehCalculo = /calcul|corrente|disjuntor|cabo|motor|chuveiro|queda|transformador|ohm|potência/i.test(mensagem);
    if (ehCalculo) await registrarCalculo(telefone, 'geral', { mensagem }, { resposta });

    await registrarConversa(telefone, resposta, 'agente');
    await enviarMensagem(telefone, resposta);

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('erro do webhook', err);
    return res.status(500).json({ error: err.message });
  }
}
