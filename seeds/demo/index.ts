import { seedDemoAccountingFirm } from "./demoAccountingFirm";
import { seedDemoBusiness } from "./demoBusiness";
import { seedDemoIndividual } from "./demoIndividual";

(async () => {
  console.log("🌱 Seeding all demo companies...");

  await seedDemoAccountingFirm();
  await seedDemoBusiness();
  await seedDemoIndividual();

  console.log("✅ Demo seeding complete.");
  process.exit(0);
})();
