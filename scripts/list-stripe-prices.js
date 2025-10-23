// Script para listar preços do produto Stripe
// Execute com: STRIPE_SECRET_KEY="sua_chave_aqui" node scripts/list-stripe-prices.js

const Stripe = require('stripe');

async function listStripePrices() {
  try {
    console.log('🔍 Listando preços do produto Stripe...');
    
    // Verificar se a chave foi fornecida
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      console.error('❌ STRIPE_SECRET_KEY não foi fornecida');
      console.log('💡 Execute o script assim:');
      console.log('   STRIPE_SECRET_KEY="sk_live_..." node scripts/list-stripe-prices.js');
      return;
    }
    
    if (!stripeSecretKey.startsWith('sk_live_')) {
      console.error('❌ STRIPE_SECRET_KEY não é uma chave de produção (deve começar com sk_live_)');
      return;
    }
    
    // Criar instância do Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-09-30.clover',
    });
    
    const productId = 'prod_THnJf3ao1QTAiU';
    
    // Buscar o produto
    const product = await stripe.products.retrieve(productId);
    console.log('📦 Produto encontrado:');
    console.log('   ID:', product.id);
    console.log('   Nome:', product.name);
    console.log('   Descrição:', product.description);
    console.log('   Ativo:', product.active);
    
    // Listar preços do produto
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
    });
    
    console.log('\n💰 Preços disponíveis:');
    
    if (prices.data.length === 0) {
      console.log('❌ Nenhum preço encontrado para este produto');
      console.log('💡 Você precisa criar preços para este produto no painel do Stripe');
      console.log('   Acesse: https://dashboard.stripe.com/products');
      return;
    }
    
    prices.data.forEach((price, index) => {
      console.log(`\n   ${index + 1}. Preço ID: ${price.id}`);
      console.log(`      Valor: ${price.unit_amount / 100} ${price.currency.toUpperCase()}`);
      console.log(`      Tipo: ${price.type}`);
      console.log(`      Recorrente: ${price.recurring ? 'Sim' : 'Não'}`);
      console.log(`      Ativo: ${price.active}`);
      
      if (price.nickname) {
        console.log(`      Apelido: ${price.nickname}`);
      }
    });
    
    console.log('\n✅ Preços listados com sucesso!');
    console.log('\n💡 Para usar na API, você precisará dos Price IDs listados acima');
    
  } catch (error) {
    console.error('❌ Erro ao listar preços:', error.message);
    
    if (error.code === 'resource_missing') {
      console.log('💡 Dica: O produto pode não existir ou você pode não ter permissão para acessá-lo');
    } else if (error.code === 'authentication_required') {
      console.log('💡 Dica: Verifique se sua chave do Stripe está correta');
    }
  }
}

// Executar
listStripePrices();