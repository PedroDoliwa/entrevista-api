const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function seedCreditPackages() {
  try {
    console.log('🌱 Iniciando seed dos pacotes de créditos...');

    // Verificar se já existem pacotes
    const existingPackages = await prisma.creditPackage.count();
    if (existingPackages > 0) {
      console.log('⚠️  Pacotes de créditos já existem. Pulando seed...');
      return;
    }

    const packages = [
      {
        name: 'Pacote Básico',
        description: 'Ideal para quem está começando com entrevistas por texto',
        credits: 10,
        price: 9.90,
      },
      {
        name: 'Pacote Popular',
        description: 'Perfeito para uso regular com entrevistas de voz',
        credits: 25,
        price: 19.90,
      },
      {
        name: 'Pacote Premium',
        description: 'Para usuários frequentes com entrevistas completas',
        credits: 50,
        price: 34.90,
      },
      {
        name: 'Pacote Empresarial',
        description: 'Para equipes e uso intensivo',
        credits: 100,
        price: 59.90,
      },
      {
        name: 'Pacote Mega',
        description: 'O melhor custo-benefício para uso profissional',
        credits: 250,
        price: 129.90,
      },
    ];

    for (const packageData of packages) {
      const created = await prisma.creditPackage.create({
        data: {
          name: packageData.name,
          description: packageData.description,
          credits: packageData.credits,
          price: packageData.price,
        },
      });
      console.log(`✅ Criado: ${created.name} - ${created.credits} créditos por R$ ${created.price}`);
    }

    console.log('🎉 Seed dos pacotes de créditos concluído!');
    
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  seedCreditPackages()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedCreditPackages };
