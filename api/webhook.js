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
    const mensagem = (body.text?.message || body.caption || '').trim();
    const nome = body.senderName || 'Usuário';

    if (!telefone || !mensagem) return res.status(200).json({ ok: true });

    const usuario = await verificarOuCriarUsuario(telefone, nome);
    await registrarConversa(telefone, mensagem, 'usuario');

    const msg = mensagem.toLowerCase().trim();

    // Comando histórico
    if (msg === 'histórico' || msg === 'historico' || msg === 'meus cálculos' || msg === 'meus calculos') {
      if (usuario.plano === 'gratis') {
        const resp = `Histórico de cálculos está disponível nos planos PRO e PREMIUM.\n\n🚀 https://pay.kiwify.com.br/3klvFH6`;
        await enviarMensagem(telefone, resp);
        return res.status(200).json({ ok: true });
      }
      const historico = await buscarHistorico(telefone, 10);
      if (!historico.length) {
        await enviarMensagem(telefone, `Você ainda não realizou nenhum cálculo. Me manda sua dúvida! 😊`);
        return res.status(200).json({ ok: true });
      }
      let resp = `📋 Seus últimos ${historico.length} cálculos:\n\n`;
      historico.forEach((c, i) => {
        const data = new Date(c.realizado_em).toLocaleDateString('pt-BR');
        const hora = new Date(c.realizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        resp += `${i + 1}. *${c.tipo_calculo || 'Cálculo'}* — ${data} às ${hora}\n`;
      });
      await enviarMensagem(telefone, resp);
      await registrarConversa(telefone, resp, 'agente');
      return res.status(200).json({ ok: true });
    }

    // Verificar limite de cálculos
    const limite = await verificarLimiteCalculos(telefone);
    if (!limite.permitido) {
      const msgLimite = `Você atingiu o limite de *5 cálculos diários* do plano grátis.\n\n🚀 Assine o PRO e calcule sem limites!\n👉 https://pay.kiwify.com.br/3klvFH6`;
      await enviarMensagem(telefone, msgLimite);
      await registrarConversa(telefone, msgLimite, 'agente');
      return res.status(200).json({ ok: true });
    }

    // IA responde tudo naturalmente
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
