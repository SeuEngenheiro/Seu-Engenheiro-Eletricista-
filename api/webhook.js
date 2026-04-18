import { verificarOuCriarUsuario, verificarLimiteCalculos, registrarCalculo, registrarConversa } from '../lib/supabase.js';
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

    const limite = await verificarLimiteCalculos(telefone);
    if (!limite.permitido) {
      const msgLimite = `⚠️ Você atingiu o limite de *3 cálculos diários* do plano grátis.\n\n🚀 Cálculos ilimitados no plano PRO/PREMIUM\n👉 Digite ASSINAR para liberar agora`;
      await enviarMensagem(telefone, msgLimite);
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
