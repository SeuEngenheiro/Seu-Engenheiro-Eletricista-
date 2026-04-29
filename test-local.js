import { chamarClaude } from './lib/claude.js';

const TELEFONE = '+5511999999999';
const PLANO = process.argv[2] || 'gratis';
const MENSAGEM = process.argv[3] || 'calcula bitola de cabo pra chuveiro 7500W em 220V';

console.log(`\n📞 Telefone: ${TELEFONE}`);
console.log(`📋 Plano: ${PLANO}`);
console.log(`💬 Mensagem: ${MENSAGEM}\n`);
console.log('⏳ Chamando agente...\n');

const inicio = Date.now();
try {
  const resposta = await chamarClaude(TELEFONE, MENSAGEM, PLANO);
  const ms = Date.now() - inicio;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(resposta);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n✓ ${ms}ms`);
} catch (err) {
  console.error('❌ Falhou:', err.message);
  process.exit(1);
}
