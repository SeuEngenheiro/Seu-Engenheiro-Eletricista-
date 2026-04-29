import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export async function verificarOuCriarUsuario(telefone, nome) {
  const { data } = await supabase.from('usuarios').select('*').eq('telefone', telefone).single();
  if (data) return data;
  const { data: novo } = await supabase.from('usuarios').insert({ telefone, nome, plano: 'gratis' }).select().single();
  return novo;
}

// Plano grátis: 20 perguntas TOTAIS por mês (cálculos + perguntas unificados)
// Plano Profissional: ilimitado, mas SEM fotos
// Plano Premium: ilimitado, com fotos (cap 30/dia pra proteger custo)
const LIMITE_GRATIS_MENSAL = 20;

function inicioMesAtual() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function verificarLimiteCalculos(telefone) {
  const { data: usuario } = await supabase.from('usuarios').select('plano').eq('telefone', telefone).single();
  if (usuario?.plano === 'pro' || usuario?.plano === 'premium') return { permitido: true, restantes: 999 };
  const inicio = inicioMesAtual();
  // Soma cálculos + perguntas no mês — limite unificado
  const [{ count: cCalc }, { count: cPerg }] = await Promise.all([
    supabase.from('calculos').select('*', { count: 'exact', head: true }).eq('telefone', telefone).gte('realizado_em', inicio.toISOString()),
    supabase.from('perguntas').select('*', { count: 'exact', head: true }).eq('telefone', telefone).gte('enviado_em', inicio.toISOString()),
  ]);
  const usados = (cCalc || 0) + (cPerg || 0);
  return { permitido: usados < LIMITE_GRATIS_MENSAL, usados, restantes: Math.max(0, LIMITE_GRATIS_MENSAL - usados) };
}

export async function verificarLimitePerguntas(telefone) {
  // Limite unificado mensal — reaproveita lógica de cálculos
  return verificarLimiteCalculos(telefone);
}

export async function verificarLimiteFotos(telefone, plano) {
  // Fotos disponíveis APENAS no plano Premium (Profissional perdeu acesso)
  if (plano !== 'premium') return { permitido: false, restantes: 0 };
  // Cap de 30/dia pra proteger custo OpenAI no Premium
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const { count } = await supabase.from('fotos').select('*', { count: 'exact', head: true }).eq('telefone', telefone).gte('enviado_em', hoje.toISOString());
  const usados = count || 0;
  return { permitido: usados < 30, usados, restantes: Math.max(0, 30 - usados) };
}

export async function verificarLimiteBuscaPreco(telefone) {
  const { data: usuario } = await supabase.from('usuarios').select('plano').eq('telefone', telefone).single();
  if (usuario?.plano !== 'premium') return { permitido: false, restantes: 0 };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const { count } = await supabase.from('buscas_preco').select('*', { count: 'exact', head: true }).eq('telefone', telefone).gte('enviado_em', hoje.toISOString());
  const usados = count || 0;
  return { permitido: usados < 7, usados, restantes: Math.max(0, 7 - usados) };
}

export async function registrarCalculo(telefone, tipo, dadosEntrada, resultado) {
  await supabase.from('calculos').insert({ telefone, tipo_calculo: tipo, dados_entrada: dadosEntrada, resultado, realizado_em: new Date().toISOString() });
}

export async function registrarConversa(telefone, mensagem, remetente) {
  await supabase.from('conversas').insert({ telefone, mensagem, remetente, enviado_em: new Date().toISOString() });
}

export async function registrarPergunta(telefone, mensagem) {
  await supabase.from('perguntas').insert({ telefone, mensagem, enviado_em: new Date().toISOString() });
}

export async function registrarFoto(telefone) {
  await supabase.from('fotos').insert({ telefone, enviado_em: new Date().toISOString() });
}

export async function registrarBuscaPreco(telefone) {
  await supabase.from('buscas_preco').insert({ telefone, enviado_em: new Date().toISOString() });
}

export async function atualizarPlano(telefone, plano) {
  await supabase.from('usuarios').update({ plano }).eq('telefone', telefone);
}

export async function buscarHistorico(telefone, limite = 10) {
  const { data, error } = await supabase.from('calculos').select('tipo_calculo, dados_entrada, resultado, realizado_em').eq('telefone', telefone).order('realizado_em', { ascending: false }).limit(limite);
  if (error) throw error;
  return data || [];
}

// ═══════════════════════════════════════════════════════════════
// HISTÓRICO DE CONVERSAS PARA CONTEXTO DA IA
// Adicionado em 26/04/2026 — corrige perda de contexto entre invocações Vercel
// ═══════════════════════════════════════════════════════════════

export async function buscarConversasRecentes(telefone, limite = 10) {
  if (!telefone) return [];

  try {
    const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('conversas')
      .select('mensagem, remetente, enviado_em')
      .eq('telefone', telefone)
      .gte('enviado_em', trintaMinAtras)
      .order('enviado_em', { ascending: false })
      .limit(limite);

    if (error) {
      console.error('[HISTORICO] Erro:', error);
      return [];
    }

    // Inverte ordem (mais antigo primeiro) e formata pro OpenAI
    return (data || [])
      .reverse()
      .map(c => ({
        role: c.remetente === 'usuario' ? 'user' : 'assistant',
        content: c.mensagem
      }));
  } catch (err) {
    console.error('[HISTORICO] Exception:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// DEDUPLICAÇÃO DE MENSAGENS DO WHATSAPP
// Adicionado em 25/04/2026 — corrige duplicação de respostas
// ═══════════════════════════════════════════════════════════════

export async function jaProcessouMensagem(messageId) {
  if (!messageId) return false;

  try {
    const { data, error } = await supabase
      .from('mensagens_processadas')
      .select('message_id')
      .eq('message_id', messageId)
      .maybeSingle();

    if (error) {
      console.error('[DEDUP] Erro ao verificar:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('[DEDUP] Exception:', err);
    return false;
  }
}

export async function marcarMensagemProcessada(messageId) {
  if (!messageId) return;

  try {
    const { error } = await supabase
      .from('mensagens_processadas')
      .insert({
        message_id: messageId,
        processado_em: new Date().toISOString()
      });

    // Erro 23505 = duplicate key (outra instância já marcou — ok)
    if (error && error.code !== '23505') {
      console.error('[DEDUP] Erro ao marcar:', error);
    }
  } catch (err) {
    console.error('[DEDUP] Exception ao marcar:', err);
  }
}
