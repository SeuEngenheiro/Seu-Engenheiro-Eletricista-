import { verificarOuCriarUsuario, verificarLimiteCalculos, registrarCalculo, registrarConversa, buscarHistorico } from '../lib/supabase.js';
import { chamarClaude } from '../lib/claude.js';
import { enviarMensagem } from '../lib/zapi.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    if (body.fromMe) return res.status(200).json({ ok: true });
    if (body.isGroup) return res.status(200).json({ ok: true });

    const telefone = body.phone?.replace(/\D/g, '');
    const mensagem = body.text?.message || body.caption || '';
    const nome = body.senderName || 'Usuário';

    if (!telefone || !mensagem) return res.status(200).json({ ok: true });

    const usuario = await verificarOuCriarUsuario(telefone, nome);
    await registrarConversa(telefone, mensagem, 'usuario');

    // Comando histórico
    const msgLower = mensagem.toLowerCase().trim();
    if (msgLower === 'histórico' || msgLower === 'historico' || msgLower === 'meus cálculos' || msgLower === 'meus calculos') {
      if (usuario.plano === 'gratis') {
        const resposta = `⚠️ O histórico de cálculos está disponível apenas nos planos *PRO* e *PREMIUM*.\n\n🚀 Assine agora e acesse todos os seus cálculos anteriores!\n👉 https://pay.kiwify.com.br/7oshP2n`;
        await enviarMensagem(telefone, resposta);
        await registrarConversa(telefone, resposta, 'agente');
        return res.status(200).json({ ok: true });
      }

      const historico = await buscarHistorico(telefone, 10);
      if (!historico.length) {
        const resposta = `📋 Você ainda não realizou nenhum cálculo.\n\nDigite *1* para acessar os cálculos elétricos! ⚡`;
        await enviarMensagem(telefone, resposta);
        return res.status(200).json({ ok: true });
      }

      let resposta = `📋 *Seus últimos ${historico.length} cálculos:*\n\n`;
      historico.forEach((c, i) => {
        const data = new Date(c.realizado_em).toLocaleDateString('pt-BR');
        const hora = new Date(c.realizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        resposta += `${i + 1}️⃣ *${c.tipo_calculo || 'Cálculo'}*\n`;
        resposta += `📅 ${data} às ${hora}\n`;
        if (c.dados_entrada?.mensagem) resposta += `📝 ${c.dados_entrada.mensagem}\n`;
        resposta += `\n`;
      });
      resposta += `👉 Posso continuar com:\n1️⃣ Voltar ao menu principal\n2️⃣ Novo cálculo`;
      await enviarMensagem(telefone, resposta);
      await registrarConversa(telefone, resposta, 'agente');
      return res.status(200).json({ ok: true });
    }

    // Verificar limite de cálculos
    const limite = await verificarLimiteCalculos(telefone);
    if (!limite.permitido) {
      const msgLimite = `⚠️ Você atingiu o limite de *5 cálculos diários* do plano grátis.\n\n🚀 Cálculos ilimitados no plano PRO/PREMIUM\n👉 https://pay.kiwify.com.br/7oshP2n`;
      await enviarMensagem(telefone, msgLimite);
      await registrarConversa(telefone, msgLimite, 'agente');
      return res.status(200).json({ ok: true });
    }

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
