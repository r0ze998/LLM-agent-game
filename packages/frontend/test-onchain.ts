import { RpcProvider, Account } from 'starknet';

const RPC = 'http://localhost:5050';
const WORLD = '0x7f33e825352c154085aa90a606f8366fbe3d58e5bc5a791cdd3ed74c8dd3fd7';
const ACCT = '0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec';
const PK = '0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912';

const PHYSICS = '0xa55f353cc852385a12a1bf729a4af74ec0de45346424fc2be4b8abc8f8711c';
const SETUP = '0x6bcdd573ef6cc0d1c3dcda9bf54df77c60e1fcfcebe9b9ebdd19461a9a6b3c9';
const VILLAGE_TICK = '0x581dc98dba986e4251f008c7743c0c3580bf87d453cab94836d0d4da4359bbe';
const COMMANDS = '0x2de775d06f620e2279f7d2dc3681054f8453fa78abad21f9d1c7b6b2f2a660a';

// Model selectors from manifest_dev.json
const MODEL_SELECTORS: Record<string, string> = {
  Village: '0x74425c1bbc578b3efc3e70f01c511b66edc0484246d311af104c16c9c10b9f1',
  GameConfig: '0x28e8dae0a1ea29fc03b1e601ab2e483024d53d1ccf29a167c35182dc8745008',
  Building: '0x58ddea2c8930eaf70f527152245effdddc1def1d4f628a3bbb076bee047575c',
  BuildingCounter: '0x124958d6aff4e4f06b9281ab814dc4f2afe4c65de3e4926d4a55c2f68735713',
};

const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account(provider, ACCT, PK);

// Cache: model selector -> layout calldata (fetched from model contract)
const layoutCache: Record<string, string[]> = {};

/** Fetch the true layout from the model contract via world.resource() -> model.layout() */
async function getModelLayout(modelSelector: string): Promise<string[]> {
  if (layoutCache[modelSelector]) return layoutCache[modelSelector];

  // Step 1: Get model contract address from world.resource(selector)
  const resourceRaw = await provider.callContract({
    contractAddress: WORLD,
    entrypoint: 'resource',
    calldata: [modelSelector],
  });
  const resourceResult: string[] = Array.isArray(resourceRaw) ? resourceRaw : (resourceRaw as any).result ?? [];
  const modelContractAddr = resourceResult[1]; // Second value is the contract address

  // Step 2: Call layout() on the model contract
  const layoutRaw = await provider.callContract({
    contractAddress: modelContractAddr,
    entrypoint: 'layout',
    calldata: [],
  });
  const layout: string[] = Array.isArray(layoutRaw) ? layoutRaw : (layoutRaw as any).result ?? [];

  layoutCache[modelSelector] = layout;
  return layout;
}

async function exec(calls: any, label: string) {
  try {
    const res = await account.execute(calls);
    console.log(`   tx: ${res.transaction_hash}`);
    await provider.waitForTransaction(res.transaction_hash);
    console.log(`   OK`);
    return true;
  } catch (e: any) {
    console.log(`   FAIL: ${e.message?.slice(0, 300)}`);
    return false;
  }
}

async function readEntity(modelName: string, keys: number[]): Promise<string[] | null> {
  const selector = MODEL_SELECTORS[modelName];
  if (!selector) { console.log(`  Unknown model: ${modelName}`); return null; }

  const keysHex = keys.map(k => `0x${k.toString(16)}`);
  const layout = await getModelLayout(selector);

  // Dojo v1.5 entity(model_selector, ModelIndex::Keys, Layout)
  // ModelIndex::Keys = enum variant 0 + Span<felt252>
  // Layout = raw output from model.layout() (already serialized as enum)
  const calldata = [
    selector,
    '0', keysHex.length.toString(), ...keysHex,  // ModelIndex::Keys(keys)
    ...layout,                                     // Layout (from model contract)
  ];

  const raw = await provider.callContract({
    contractAddress: WORLD,
    entrypoint: 'entity',
    calldata,
  });
  const result: string[] = Array.isArray(raw) ? raw : (raw as any).result ?? [];

  if (result.length < 2) return null;
  const len = Number(result[0]);
  const values = result.slice(1, 1 + len);
  return values;
}

async function readGameConfig() {
  const v = await readEntity('GameConfig', [0]);
  console.log(`   GameConfig raw: [${v?.join(', ')}]`);
  if (!v || v.length < 4) return { currentTick: 0, tickInterval: 0, maxVillages: 0, initialized: false };
  return {
    currentTick: Number(v[0]),
    tickInterval: Number(v[1]),
    maxVillages: Number(v[2]),
    initialized: Number(v[3]) === 1,
  };
}

async function readVillage(id: number) {
  const v = await readEntity('Village', [id]);
  if (!v) return null;
  console.log(`   Village raw (${v.length} fields): [${v.map((x, i) => `${i}:${x}`).join(', ')}]`);

  // Village fields (19): owner(0), food(1), wood(2), stone(3), iron(4), gold(5),
  // storage_food(6)..storage_gold(10), population(11), housing(12),
  // research(13), culture(14), total_culture(15), score(16), founded_at(17), last_tick(18)
  if (v.length < 17) {
    console.log(`   Not enough fields: ${v.length}`);
    return null;
  }
  return {
    owner: v[0],
    population: Number(v[11]),
    housing: Number(v[12]),
    food: Number(BigInt(v[1])) / 1000,
    wood: Number(BigInt(v[2])) / 1000,
    stone: Number(BigInt(v[3])) / 1000,
    iron: Number(BigInt(v[4])) / 1000,
    gold: Number(BigInt(v[5])) / 1000,
    researchPts: Number(BigInt(v[13])) / 1000,
    culturePts: Number(BigInt(v[14])) / 1000,
    score: Number(v[16]),
  };
}

async function test() {
  console.log('=== E2E: starknet.js v6 + Dojo v1.5 (dynamic layout) → Katana ===\n');

  console.log('0. Check GameConfig before init');
  const gc0 = await readGameConfig();
  console.log('  ', gc0);

  console.log('\n1. Initialize physics');
  await exec({ contractAddress: PHYSICS, entrypoint: 'initialize_physics', calldata: [] }, 'physics');

  console.log('\n1b. Check GameConfig after physics init');
  const gc1 = await readGameConfig();
  console.log('  ', gc1);

  console.log('\n2. Setup register_all');
  await exec({ contractAddress: SETUP, entrypoint: 'register_all', calldata: [] }, 'setup');

  console.log('\n3. Create village');
  await exec({ contractAddress: VILLAGE_TICK, entrypoint: 'create_village', calldata: [ACCT] }, 'create');

  console.log('\n4. advance_tick + village_tick(1)');
  await exec([
    { contractAddress: COMMANDS, entrypoint: 'advance_tick', calldata: [] },
    { contractAddress: VILLAGE_TICK, entrypoint: 'tick', calldata: ['1'] },
  ], 'tick1');

  console.log('\n5. Read village');
  const v1 = await readVillage(1);
  console.log('  Village:', v1);

  console.log('\n6. Build farm (defId=1)');
  await exec({ contractAddress: COMMANDS, entrypoint: 'build', calldata: ['1', '1', '0', '0'] }, 'build');

  console.log('\n7. Second tick');
  await exec([
    { contractAddress: COMMANDS, entrypoint: 'advance_tick', calldata: [] },
    { contractAddress: VILLAGE_TICK, entrypoint: 'tick', calldata: ['1'] },
  ], 'tick2');

  console.log('\n8. Re-read village');
  const v2 = await readVillage(1);
  console.log('  Village:', v2);

  if (v1 && v2) {
    console.log('\n=== Deltas ===');
    console.log('   Food:', v1.food.toFixed(2), '->', v2.food.toFixed(2));
    console.log('   Wood:', v1.wood.toFixed(2), '->', v2.wood.toFixed(2));
    console.log('   Pop:', v1.population, '->', v2.population);
    console.log('   Score:', v1.score, '->', v2.score);
  }

  console.log('\n=== Done ===');
}

test().catch(console.error);
