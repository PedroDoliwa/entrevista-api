# Configuração do Stripe com Produtos

Para usar o Stripe como forma de pagamento com produtos, você precisa configurar as seguintes variáveis de ambiente no seu arquivo `.env`:

## ⚠️ IMPORTANTE - MODO PRODUÇÃO

Você forneceu uma chave pública de **PRODUÇÃO** (`pk_live_`) e um produto Stripe (`prod_THnJf3ao1QTAiU`). Isso significa que você está configurando para processar pagamentos reais!

### Variáveis Obrigatórias para PRODUÇÃO

```env
# Stripe Configuration - PRODUÇÃO
STRIPE_SECRET_KEY="sk_live_..." # ⚠️ SUA CHAVE SECRETA DE PRODUÇÃO
STRIPE_PUBLISHABLE_KEY="pk_live_51SLCyZHVh8rgC6cSRmdxMKlLefdb2P2LeJcdnv9ZNScgKxY81BhPo3GxEoGIolML81xVvOWYeyr8Kv6z3piuu2EA00AWDN7yZC"
STRIPE_WEBHOOK_SECRET="whsec_..." # ⚠️ SECRET DO WEBHOOK DE PRODUÇÃO
STRIPE_CURRENCY="BRL"
```

## 📦 Produto Configurado

- **Produto ID**: `prod_THnJf3ao1QTAiU`
- **Nome**: TESTE
- **Status**: ✅ Ativo
- **Preços**: ✅ Configurado (1 preço disponível)
  - **Price ID**: `price_1SLDj8HVh8rgC6cSrwxsHLhw`
  - **Valor**: R$ 10,00 BRL
  - **Tipo**: Pagamento único (one_time)

## 🔑 Como Obter as Chaves de Produção

1. **Acesse o painel do Stripe**: https://dashboard.stripe.com/
2. **Certifique-se de estar em modo LIVE** (não Test mode)
3. **Chaves de API**: Vá em "Developers" > "API keys"
4. **Chave Secreta**: Copie a "Secret key" (começa com `sk_live_`)
5. **Chave Pública**: Já fornecida: `pk_live_51SLCyZHVh8rgC6cSRmdxMKlLefdb2P2LeJcdnv9ZNScgKxY81BhPo3GxEoGIolML81xVvOWYeyr8Kv6z3piuu2EA00AWDN7yZC`

## 💰 Configuração de Preços

Para usar produtos do Stripe, você precisa:

1. **Criar preços para seu produto**:
   - Acesse: https://dashboard.stripe.com/products
   - Selecione o produto `prod_THnJf3ao1QTAiU`
   - Clique em "Add price"
   - Configure valor, moeda e tipo (one-time ou recurring)

2. **Configurar metadata do produto** (recomendado):
   - Adicione `credits` no metadata do produto
   - Exemplo: `credits: "10"` para 10 créditos

3. **Listar preços disponíveis**:
   ```bash
   STRIPE_SECRET_KEY="sk_live_..." node scripts/list-stripe-prices.js
   ```

## 🔄 Novas Rotas da API

### 1. Listar Produtos e Preços
```http
GET /payments/products
GET /payments/products?productId=prod_THnJf3ao1QTAiU
```

### 2. Criar Payment Intent (atualizada)
```http
POST /payments/create-intent
Content-Type: application/json

{
  "userId": "uuid-do-usuario",
  "priceId": "price_1234567890" // ID do preço do Stripe
}
```

### 3. Confirmar Pagamento (inalterada)
```http
POST /payments/confirm
Content-Type: application/json

{
  "paymentIntentId": "pi_1234567890"
}
```

## ⚠️ Configuração do Webhook de PRODUÇÃO

1. **Acesse Webhooks**: Vá em "Developers" > "Webhooks"
2. **Certifique-se de estar em modo LIVE**
3. **Adicionar Endpoint**: Clique em "Add endpoint"
4. **URL do Webhook**: `https://seu-dominio-producao.com/payments/webhook`
5. **Eventos**: Selecione:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
6. **Signing Secret**: Copie o "Signing secret" (começa com `whsec_`)

## 🚨 IMPORTANTE - Verificações de Segurança

Antes de usar em produção, certifique-se de que:

- [ ] Sua conta Stripe está verificada e ativa
- [ ] Você tem as permissões necessárias para processar pagamentos
- [ ] O webhook está configurado corretamente
- [ ] Você testou com valores pequenos primeiro
- [ ] Tem um plano de monitoramento de transações
- [ ] Preços estão configurados para o produto
- [ ] Metadata do produto está configurada (se necessário)

## 💳 Cartões de Teste (NÃO funcionam em produção)

Em produção, você só pode usar cartões reais. Para testar, use o modo de teste primeiro:

### Modo de Teste (para desenvolvimento)
```env
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

Cartões de teste:
- **Sucesso**: `4242 4242 4242 4242`
- **Falha**: `4000 0000 0000 0002`

## 🔄 Exemplo de Uso no Frontend (PRODUÇÃO)

```javascript
import { loadStripe } from '@stripe/stripe-js';

// Use sua chave pública de produção
const stripe = await loadStripe('pk_live_51SLCyZHVh8rgC6cSRmdxMKlLefdb2P2LeJcdnv9ZNScgKxY81BhPo3GxEoGIolML81xVvOWYeyr8Kv6z3piuu2EA00AWDN7yZC');

// 1. Listar produtos disponíveis
const products = await fetch('/payments/products').then(r => r.json());

// 2. Criar payment intent com priceId
const { clientSecret } = await fetch('/payments/create-intent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    userId: 'uuid-do-usuario',
    priceId: 'price_1SLDj8HVh8rgC6cSrwxsHLhw' // ID do preço real
  })
}).then(r => r.json());

// 3. Confirmar o pagamento
const { error } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      name: 'Nome do usuário',
    },
  }
});
```

## 📋 Checklist de Produção

- [ ] Chave secreta de produção configurada (`sk_live_`)
- [ ] Chave pública de produção configurada (`pk_live_`)
- [ ] Produto Stripe criado (`prod_THnJf3ao1QTAiU`) ✅
- [ ] Preços configurados para o produto ✅
- [ ] Metadata do produto configurada (se necessário)
- [ ] Webhook de produção configurado
- [ ] URL do webhook aponta para produção
- [ ] Conta Stripe verificada
- [ ] Testes realizados com valores pequenos
- [ ] Monitoramento configurado
- [ ] Plano de contingência definido

## 🛠️ Scripts Úteis

```bash
# Listar preços do produto
STRIPE_SECRET_KEY="sk_live_..." node scripts/list-stripe-prices.js

# Testar conexão de produção
npm run test:stripe:production

# Testar conexão de desenvolvimento
npm run test:stripe
```
