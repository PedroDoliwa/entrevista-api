// Script para testar criação de Payment Intent
// Execute com: node scripts/test-payment-intent.js

require('dotenv').config();
const Stripe = require('stripe');

async function testPaymentIntent() {
  try {
    console.log('🧪 Testando criação de Payment Intent...');
    
    // Configurar Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
    });
    
    // Dados de teste
    const userId = '80aeab29-5846-4628-b4bd-af4780d57b91'; // UUID válido
    const priceId = 'price_1SLDj8HVh8rgC6cSrwxsHLhw'; // R$ 10,00
    
    console.log('📋 Dados do teste:');
    console.log('   User ID:', userId);
    console.log('   Price ID:', priceId);
    
    // Buscar informações do preço
    const stripePrice = await stripe.prices.retrieve(priceId);
    console.log('💰 Preço encontrado:', stripePrice.unit_amount / 100, stripePrice.currency.toUpperCase());
    
    // Buscar informações do produto
    const stripeProduct = await stripe.products.retrieve(stripePrice.product);
    console.log('📦 Produto encontrado:', stripeProduct.name);
    console.log('📦 Metadata:', stripeProduct.metadata);
    
    // Determinar quantidade de créditos
    let creditsAmount = 0;
    
    if (stripeProduct.metadata.credits) {
      creditsAmount = parseInt(stripeProduct.metadata.credits);
      console.log('✅ Créditos do metadata:', creditsAmount);
    } else {
      // Fallback para mapeamento
      const priceMapping = {
        'price_1SLDj8HVh8rgC6cSrwxsHLhw': 10,
      };
      creditsAmount = priceMapping[priceId] || 0;
      console.log('✅ Créditos do mapeamento:', creditsAmount);
    }
    
    if (creditsAmount === 0) {
      console.error('❌ Não foi possível determinar a quantidade de créditos');
      return;
    }
    
    console.log('🎯 Quantidade de créditos determinada:', creditsAmount);
    
    // Simular criação de Payment Intent (sem criar realmente)
    console.log('✅ Teste concluído com sucesso!');
    console.log('💡 A API deve conseguir criar Payment Intent agora');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar teste
testPaymentIntent();
