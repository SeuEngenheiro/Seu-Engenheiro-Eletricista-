import { verificarOuCriarUsuario, verificarLimiteCalculos, registrarCalculo, registrarConversa, buscarHistorico } from '../lib/supabase.js';
import { chamarClaude } from '../lib/claude.js';
import { enviarMensagem } from '../lib/zapi.js';

// Estado de navegação em memória (30 min por usuário)
const estados = new Map();
const TEMPO_ESTADO = 30 * 60 * 1000;

function getEstado(telefone) {
  const e = estados.get(telefone);
  if (!e || Date.now() - e.timestamp > TEMPO_ESTADO) return { tela: 'menu' };
  return e;
}

function setEstado(telefone, tela, extra = {}) {
  estados.set(telefone, { tela, ...extra, timestamp: Date.now() });
}

// Menus fixos
const MENU_PRINCIPAL = `⚡ Olá! Bem-vindo ao *Engenheiro Eletricista AI* 👷

Como posso te ajudar hoje?

1️⃣ Cálculo elétrico
2️⃣ Projeto elétrico completo
3️⃣ Dúvidas técnicas
4️⃣ Normas técnicas
5️⃣ Conversões elétricas
6️⃣ Planos e acesso 🚀
7️⃣ Suporte

👉 Digite o número ou descreva o que você precisa.`;

const MENU_CALCULO = `🔧 *Cálculo Elétrico*

Qual o tipo de cálculo?

1️⃣ Motor elétrico
2️⃣ Resistência / aquecedor
3️⃣ Iluminação
4️⃣ Tomadas / circuito geral
5️⃣ Chuveiro elétrico
6️⃣ Ar-condicionado
7️⃣ Lei de Ohm (V, I, R)
8️⃣ Queda de tensão
9️⃣ Banco de capacitores
🔟 Transformador

👉 Digite o número do cálculo desejado

👉 Posso continuar com:
1️⃣ Voltar ao menu principal
2️⃣ Voltar ao menu anterior`;

const MENU_NORMAS = `📋 *Normas Técnicas — Consulta Rápida*

Qual norma deseja consultar?
1️⃣ NR-10 (segurança em eletricidade)
2️⃣ NBR 5410 (instalações de baixa tensão)
3️⃣ NBR 5413 (iluminância de interiores)
4️⃣ NBR 5419 (proteção contra descargas atmosféricas)
5️⃣ NBR 5419-4 (equipotencialização e aterramento)

👉 Posso continuar com:
1️⃣ Voltar ao menu principal
2️⃣ Voltar ao menu anterior`;

const RODAPE = `\n\n👉 Posso continuar com:\n1️⃣ Voltar ao menu principal\n2️⃣ Voltar ao menu anterior\nDigite o número 👍`;

function isMenuOuOla(msg) {
  const v = msg.toLowerCase().trim();
  return ['oi','olá','ola','menu','inicio','início','começar','comecar','start'].includes(v);
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

    const estado = getEstado(telefone);
    const msg = mensagem.toLowerCase().trim();

    // ═══ SAUDAÇÃO / MENU ═══
    if (isMenuOuOla(mensagem)) {
      setEstado(telefone, 'menu_principal');
      await enviarMensagem(telefone, MENU_PRINCIPAL);
      await registrarConversa(telefone, MENU_PRINCIPAL, 'agente');
      return res.status(200).json({ ok: true });
    }

    // ═══ NAVEGAÇÃO DO RODAPÉ ═══
    // Se usuário está em qualquer tela com rodapé e digita 1 ou 2
    if (['1','2'].includes(msg) && !['menu_principal'].includes(estado.tela)) {
      if (msg === '1') {
        // Voltar ao menu principal
        setEstado(telefone, 'menu_principal');
        await enviarMensagem(telefone, MENU_PRINCIPAL);
        await registrarConversa(telefone, MENU_PRINCIPAL, 'agente');
        return res.status(200).json({ ok: true });
      }
      if (msg === '2') {
        // Voltar ao menu anterior
        const anterior = estado.anterior || 'menu_principal';
        if (anterior === 'calculo') {
          setEstado(telefone, 'menu_calculo', { anterior: 'menu_principal' });
          await enviarMensagem(telefone, MENU_CALCULO);
          await registrarConversa(telefone, MENU_CALCULO, 'agente');
        } else if (anterior === 'normas') {
          setEstado(telefone, 'menu_normas', { anterior: 'menu_principal' });
          await enviarMensagem(telefone, MENU_NORMAS);
          await registrarConversa(telefone, MENU_NORMAS, 'agente');
        } else {
          setEstado(telefone, 'menu_principal');
          await enviarMensagem(telefone, MENU_PRINCIPAL);
          await registrarConversa(telefone, MENU_PRINCIPAL, 'agente');
        }
        return res.status(200).json({ ok: true });
      }
    }

    // ═══ MENU PRINCIPAL ═══
    if (estado.tela === 'menu_principal' || isMenuOuOla(mensagem)) {
      if (msg === '1' || msg.includes('cálculo') || msg.includes('calcul')) {
        setEstado(telefone, 'menu_calculo', { anterior: 'menu_principal' });
        await enviarMensagem(telefone, MENU_CALCULO);
        await registrarConversa(telefone, MENU_CALCULO, 'agente');
        return res.status(200).json({ ok: true });
      }
      if (msg === '4' || msg.includes('norma') || msg.includes('nbr') || msg.includes('nr-10')) {
        setEstado(telefone, 'menu_normas', { anterior: 'menu_principal' });
        await enviarMensagem(telefone, MENU_NORMAS);
        await registrarConversa(telefone, MENU_NORMAS, 'agente');
        return res.status(200).json({ ok: true });
      }
      if (msg === '6' || msg.includes('plano') || msg.includes('preço') || msg.includes('assinar')) {
        setEstado(telefone, 'planos', { anterior: 'menu_principal' });
        const resposta = await chamarClaude(telefone, '6', usuario.plano);
        await enviarMensagem(telefone, resposta + RODAPE);
        await registrarConversa(telefone, resposta, 'agente');
        return res.status(200).json({ ok: true });
      }
      if (msg === '7' || msg.includes('suporte')) {
        setEstado(telefone, 'suporte', { anterior: 'menu_principal' });
        const resposta = await chamarClaude(telefone, '7', usuario.plano);
        await enviarMensagem(telefone, resposta + RODAPE);
        await registrarConversa(telefone, resposta, 'agente');
        return res.status(200).json({ ok: true });
      }
    }

    // ═══ COMANDO HISTÓRICO ═══
    if (msg === 'histórico' || msg === 'historico' || msg === 'meus cálculos' || msg === 'meus calculos') {
      if (usuario.plano === 'gratis') {
        const resp = `⚠️ O histórico está disponível apenas nos planos *PRO* e *PREMIUM*.\n\n🚀 Assine agora!\n👉 https://pay.kiwify.com.br/7oshP2n${RODAPE}`;
        await enviarMensagem(telefone, resp);
        return res.status(200).json({ ok: true });
      }
      const historico = await buscarHistorico(telefone, 10);
      if (!historico.length) {
        await enviarMensagem(telefone, `📋 Você ainda não realizou nenhum cálculo.${RODAPE}`);
        return res.status(200).json({ ok: true });
      }
      let resp = `📋 *Seus últimos ${historico.length} cálculos:*\n\n`;
      historico.forEach((c, i) => {
        const data = new Date(c.realizado_em).toLocaleDateString('pt-BR');
        const hora = new Date(c.realizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        resp += `${i + 1}. *${c.tipo_calculo || 'Cálculo'}* — ${data} às ${hora}\n`;
      });
      resp += RODAPE;
      await enviarMensagem(telefone, resp);
      return res.status(200).json({ ok: true });
    }

    // ═══ IA LIVRE — responde qualquer pergunta técnica ═══
    const limite = await verificarLimiteCalculos(telefone);
    if (!limite.permitido) {
      const msgLimite = `⚠️ Você atingiu o limite de *5 cálculos diários* do plano grátis.\n\n🚀 Cálculos ilimitados no plano PRO!\n👉 https://pay.kiwify.com.br/7oshP2n${RODAPE}`;
      await enviarMensagem(telefone, msgLimite);
      await registrarConversa(telefone, msgLimite, 'agente');
      return res.status(200).json({ ok: true });
    }

    // Chama a IA para responder
    setEstado(telefone, 'ia_livre', { anterior: estado.tela || 'menu_principal' });
    const resposta = await chamarClaude(telefone, mensagem, usuario.plano);

    const ehCalculo = /calcul|corrente|disjuntor|cabo|motor|chuveiro|queda|transformador|ohm|potência/i.test(mensagem);
    if (ehCalculo) await registrarCalculo(telefone, 'geral', { mensagem }, { resposta });

    await registrarConversa(telefone, resposta, 'agente');
    await enviarMensagem(telefone, resposta + RODAPE);

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('erro do webhook', err);
    return res.status(500).json({ error: err.message });
  }
}
