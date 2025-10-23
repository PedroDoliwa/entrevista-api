// Script de teste para verificar a integração com Stripe em PRODUÇÃO
// ⚠️ ATENÇÃO: Este script fará chamadas reais para o Stripe em modo LIVE
// Execute com: node scripts/test-stripe-production.js

require('dotenv').config();
const Stripe = require('stripe');

async function testStripeProductionConnection() {
  try {
    console.log('🔍 Testando conexão com Stripe em PRODUÇÃO...');
    console.log('⚠️  ATENÇÃO: Este teste fará chamadas REAIS para o Stripe!');
    
    // Verificar se as variáveis de ambiente estão configuradas
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY não está definida');
      return;
    }
    
    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
      console.error('❌ STRIPE_SECRET_KEY não é uma chave de produção (deve começar com sk_live_)');
      return;
    }
    
    console.log('✅ Chave de produção do Stripe encontrada');
    
    // Criar instância do Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
    });
    
    // Verificar se a chave pública está configurada
    if (!process.env.STRIPE_PUBLISHABLE_KEY) {
      console.error('❌ STRIPE_PUBLISHABLE_KEY não está definida');
      return;
    }
    
    if (!process.env.STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_')) {
      console.error('❌ STRIPE_PUBLISHABLE_KEY não é uma chave de produção (deve começar com pk_live_)');
      return;
    }
    
    console.log('✅ Chave pública de produção configurada');
    console.log('📋 Chave pública:', process.env.STRIPE_PUBLISHABLE_KEY);
    
    // Testar conexão fazendo uma chamada simples
    console.log('🔍 Testando conexão com Stripe...');
    const balance = await stripe.balance.retrieve();
    
    console.log('✅ Conexão com Stripe estabelecida com sucesso!');
    console.log('💰 Saldo disponível:', balance.available[0]?.amount || 0, balance.available[0]?.currency || 'BRL');
    
    // Testar o produto específico
    console.log('🔍 Testando produto específico...');
    const product = await stripe.products.retrieve('prod_THnJf3ao1QTAiU');
    console.log('📦 Produto encontrado:', product.name);
    
    // Listar preços do produto
    const prices = await stripe.prices.list({
      product: 'prod_THnJf3ao1QTAiU',
      active: true,
    });
    
    console.log('💰 Preços disponíveis:', prices.data.length);
    prices.data.forEach((price, index) => {
      console.log(`   ${index + 1}. ${price.id}: ${price.unit_amount / 100} ${price.currency.toUpperCase()}`);
    });
    
    // ⚠️ AVISO: Não vamos criar Payment Intent real em produção para teste
    console.log('⚠️  Não criando Payment Intent real para evitar cobranças');
    console.log('💡 Para testar pagamentos, use valores pequenos em ambiente controlado');
    
    console.log('\n🎉 Configuração de produção verificada com sucesso!');
    console.log('📋 Próximos passos:');
    console.log('   1. Configure o webhook de produção');
    console.log('   2. Teste com valores pequenos');
    console.log('   3. Monitore as transações');
    
  } catch (error) {
    console.error('❌ Erro ao testar Stripe:', error.message);
    
    if (error.code === 'authentication_required') {
      console.log('💡 Dica: Verifique se sua chave de produção está correta');
    } else if (error.code === 'invalid_request_error') {
      console.log('💡 Dica: Verifique se sua conta Stripe está configurada para produção');
    } else if (error.code === 'account_invalid') {
      console.log('💡 Dica: Sua conta Stripe pode não estar verificada para produção');
    }
  }
}

// Executar teste
testStripeProductionConnection();
