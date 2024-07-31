import { PrismaClient } from "@prisma/client";
import { connect } from "http2";
const prisma = new PrismaClient();

async function main() {
  //Roles
  const adminRole = await prisma.role.create({
    data: {
      name: "admin",
      description: "Administrator role with full access",
    },
  });

  const accountantRole = await prisma.role.create({
    data: {
      name: "accountant",
      description: "Accounting firm users",
    },
  });

  const clientRole = await prisma.role.create({
    data: {
      name: "client",
      description: "clients",
    },
  });

  //Currencies
  const nairaCurrency = await prisma.currency.create({
    data: {
      name: "Naira",
      code: "NGN",
      symbol: "₦",
    },
  });

  //Companies
  const testCompany = await prisma.company.create({
    data: {
      name: "Test Company 1",
      country: "Nigeria",
      reportingCurrencyId: nairaCurrency.id,
    },
  });

  //Users
  const adminUser = await prisma.user.upsert({
    where: { email: "a.adenuga@accountable.global" },
    update: {},
    create: {
      firstname: "Temi",
      lastname: "Adenuga",
      email: "a.adenuga@accountable.global",
      password: "securepassword",
      role: {
        connect: { id: adminRole.id },
      },
      companies: {
        create: {
          companyId: testCompany.id,
          role: "admin",
        },
      },
    },
  });

  console.log(
    adminRole,
    accountantRole,
    clientRole,
    nairaCurrency,
    testCompany,
    adminUser
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
