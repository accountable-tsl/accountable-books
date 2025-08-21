// import Knex from 'knex';
// import { knexClient } from '../../src/db/knexClient';

// const SEEDS = { 'demo:individual': demoIndividual };

// async function main() {
//   const [cmd, ...rest] = process.argv.slice(2);
//   const get = (f: string) => {
//     const i = rest.indexOf(f);
//     return i >= 0 ? rest[i + 1] : undefined;
//   };

//   const name = get('--name');
//   const tag = get('--tag');
//   const companyId = get('--company');
//   const versionBump = get('--bump') ? Number(get('--bump')) : undefined;
//   const db = knexClient;

//   const selected = Object.values(SEEDS).filter((s) =>
//     name ? s.name === name : tag ? s.tags.includes(tag) : true,
//   );

//   if (cmd === 'apply') {
//     for (const s of selected) await s.up(db, { companyId } as SeedCtx);
//   } else if (cmd === 'purge') {
//     for (const s of selected) await s.down(db, { companyId } as SeedCtx);
//   } else if (cmd === 'list') {
//     console.table(await db('seed_runs').orderBy('applied_at', 'desc'));
//   } else {
//     console.log(
//       'Usage: tsx seeds/cli.ts apply|purge|list [--name <seed>] [--tag <tag>] [--company <uuid>]',
//     );
//   }
//   await db.destroy();
// }
// main().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });
