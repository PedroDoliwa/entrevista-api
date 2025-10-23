// Script de teste para verificar a integração com Stripe
// Execute com: node scripts/test-stripe.js

require('dotenv').config();
const { stripe } = require('../src/lib/stripe');

async function testStripeConnection() {
  try {
    console.log('🔍 Testando conexão com Stripe...');
    
    // Verificar se as variáveis de ambiente estão configuradas
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY não está definida');
      return;
    }
    
    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      console.error('❌ STRIPE_SECRET_KEY não parece ser uma chave válida do Stripe');
      return;
    }
    
    console.log('✅ Chave do Stripe encontrada');
    
    // Testar conexão fazendo uma chamada simples
    const balance = await stripe.balance.retrieve();
    
    console.log('✅ Conexão com Stripe estabelecida com sucesso!');
    console.log('💰 Saldo disponível:', balance.available[0]?.amount || 0, balance.available[0]?.currency || 'BRL');
    
    // Testar criação de um Payment Intent (sem processar)
    console.log('🔍 Testando criação de Payment Intent...');
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // R$ 10,00 em centavos
      currency: 'brl',
      metadata: {
        test: 'true',
        description: 'Teste de integração'
      },
      description: 'Teste de integração Stripe'
    });
    
    console.log('✅ Payment Intent criado com sucesso!');
    console.log('📋 ID:', paymentIntent.id);
    console.log('📋 Status:', paymentIntent.status);
    console.log('📋 Client Secret:', paymentIntent.client_secret?.substring(0, 20) + '...');
    
    // Cancelar o Payment Intent de teste
    await stripe.paymentIntents.cancel(paymentIntent.id);
    console.log('✅ Payment Intent cancelado');
    
    console.log('\n🎉 Todos os testes passaram! A integração com Stripe está funcionando.');
    
  } catch (error) {
    console.error('❌ Erro ao testar Stripe:', error.message);
    
    if (error.code === 'authentication_required') {
      console.log('💡 Dica: Verifique se sua chave do Stripe está correta');
    } else if (error.code === 'invalid_request_error') {
      console.log('💡 Dica: Verifique se sua conta Stripe está configurada corretamente');
    }
  }
}

// Executar teste
testStripeConnection();
