// Script para testar Payment Intent via API
// Execute com: node scripts/test-api-payment.js

const https = require('https');
const http = require('http');

async function testAPIPayment() {
  try {
    console.log('🧪 Testando Payment Intent via API...');
    
    const data = JSON.stringify({
      userId: '80aeab29-5846-4628-b4bd-af4780d57b91',
      priceId: 'price_1SLEkTHVh8rgC6cSQuFUKIqe'
    });
    
    const options = {
      hostname: 'localhost',
      port: 3333,
      path: '/payments/create-intent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = http.request(options, (res) => {
      console.log('📊 Status:', res.statusCode);
      console.log('📊 Headers:', res.headers);
      
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          console.log('✅ Resposta:', JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('📄 Resposta (texto):', responseData);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Erro na requisição:', error.message);
    });
    
    req.write(data);
    req.end();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Executar teste
testAPIPayment();
