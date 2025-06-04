import { seedDemoAccountingFirm } from "./demoAccountingFirm";
import { seedDemoBusiness } from "./demoBusiness";
import { seedDemoIndividual } from "./demoIndividual";
import { seedAllDemos } from "./demoSeeds";

(async () => {
  console.log("🌱 Seeding all demo companies...");

  await seedAllDemos();

  console.log("✅ Demo seeding complete.");
  process.exit(0);
})();
