import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export async function verificarOuCriarUsuario(telefone, nome) {
  const { data } = await supabase.from('usuarios').select('*').eq('telefone', telefone).single();
  if (data) return data;
  const { data: novo } = await supabase.from('usuarios').insert({ telefone, nome, plano: 'gratis' }).select().single();
  return novo;
}

export async function verificarLimiteCalculos(telefone) {
  const { data: usuario } = await supabase.from('usuarios').select('plano').eq('telefone', telefone).single();
  if (usuario?.plano === 'pro' || usuario?.plano === 'premium') return { permitido: true, restantes: 999 };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const { count } = await supabase.from('calculos').select('*', { count: 'exact', head: true }).eq('telefone', telefone).gte('realizado_em', hoje.toISOString());
  const usados = count || 0;
  return { permitido: usados < 5, usados, restantes: Math.max(0, 5 - usados) };
}

export async function verificarLimitePerguntas(telefone) {
  const { data: usuario } = await supabase.from('usuarios').select('plano').eq('telefone', telefone).single();
  if (usuario?.plano === 'pro' || usuario?.plano === 'premium') return { permitido: true, restantes: 999 };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const { count } = await supabase.from('conversas').select('*', { count: 'exact', head: true })
    .eq('telefone', telefone)
    .eq('remetente', 'usuario')
    .eq('tipo', 'pergunta')
    .gte('enviado_em', hoje.toISOString());
  const usados = count || 0;
  return { permitido: usados < 5, usados, restantes: Math.max(0, 5 - usados) };
}

export async function registrarPergunta(telefone, mensagem) {
  await supabase.from('conversas').insert({ telefone, mensagem, remetente: 'usuario', tipo: 'pergunta', enviado_em: new Date().toISOString() });
}

export async function registrarCalculo(telefone, tipo, dadosEntrada, resultado) {
  await supabase.from('calculos').insert({ telefone, tipo_calculo: tipo, dados_entrada: dadosEntrada, resultado, realizado_em: new Date().toISOString() });
}

export async function registrarConversa(telefone, mensagem, remetente) {
  await supabase.from('conversas').insert({ telefone, mensagem, remetente, enviado_em: new Date().toISOString() });
}

export async function atualizarPlano(telefone, plano) {
  await supabase.from('usuarios').update({ plano }).eq('telefone', telefone);
}

export async function buscarHistorico(telefone, limite = 10) {
  const { data, error } = await supabase
    .from('calculos')
    .select('tipo_calculo, dados_entrada, resultado, realizado_em')
    .eq('telefone', telefone)
    .order('realizado_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}
