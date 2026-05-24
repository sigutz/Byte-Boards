import assert = require('assert');
import { getValidActions, applyAction, computeVP, EMPTY_DEV_CARDS } from './src/game/catan';
import type { PlayerState } from './src/game/catan';

const base = (): PlayerState => ({
  agentId: 1, name: 'Test',
  wood: 0, brick: 0, ore: 0, wheat: 0, sheep: 0,
  settlementNodes: [], cityNodes: [], roadEdges: [], shipEdges: [],
  devCards: { ...EMPTY_DEV_CARDS },
  knightsPlayed: 0, hasLargestArmy: false, hasLongestRoad: false, islandVPs: 0,
});

const empty = { settlements: [], cities: [], roads: [] };

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

// --- getValidActions ---
console.log('\ngetValidActions');

test('always includes pass', () => {
  assert(getValidActions(base(), [], empty).includes('pass'));
});

test('no road if broke', () => {
  assert(!getValidActions(base(), [], empty).some(a => a.startsWith('build_road')));
});

test('no settlement without a road', () => {
  const p = { ...base(), wood: 1, brick: 1, wheat: 1, sheep: 1 };
  assert(!getValidActions(p, [], empty).some(a => a.startsWith('build_settlement')));
});

test('offers bank trade when 4+ of a resource', () => {
  const p = { ...base(), wood: 4 };
  assert(getValidActions(p, [], empty).some(a => a.startsWith('trade_bank:wood:')));
});

test('no bank trade when below 4', () => {
  const p = { ...base(), wood: 3 };
  assert(!getValidActions(p, [], empty).some(a => a.startsWith('trade_bank:wood:')));
});

test('offers buy_dev_card when affordable', () => {
  const p = { ...base(), ore: 1, wheat: 1, sheep: 1 };
  assert(getValidActions(p, [], empty).includes('buy_dev_card'));
});

// --- applyAction ---
console.log('\napplyAction');

test('build_settlement deducts resources and adds node', () => {
  const p = { ...base(), wood: 1, brick: 1, wheat: 1, sheep: 1, roadEdges: ['0506'] };
  applyAction(p, 'build_settlement:05');
  assert.equal(p.wood, 0); assert.equal(p.brick, 0);
  assert.equal(p.wheat, 0); assert.equal(p.sheep, 0);
  assert(p.settlementNodes.includes(5));
});

test('build_city removes settlement and adds city node', () => {
  const p = { ...base(), wheat: 2, ore: 3, settlementNodes: [5] };
  applyAction(p, 'build_city:05');
  assert(!p.settlementNodes.includes(5));
  assert(p.cityNodes.includes(5));
  assert.equal(p.wheat, 0); assert.equal(p.ore, 0);
});

test('trade_bank swaps 4 for 1', () => {
  const p = { ...base(), wood: 4 };
  applyAction(p, 'trade_bank:wood:ore');
  assert.equal(p.wood, 0); assert.equal(p.ore, 1);
});

test('pass returns vpDelta 0', () => {
  assert.equal(applyAction(base(), 'pass').vpDelta, 0);
});

// --- computeVP ---
console.log('\ncomputeVP');

test('1 settlement = 1 VP', () => {
  assert.equal(computeVP({ ...base(), settlementNodes: [1] }), 1);
});

test('1 city = 2 VP', () => {
  assert.equal(computeVP({ ...base(), cityNodes: [1] }), 2);
});

test('largest army = +2 VP', () => {
  assert.equal(computeVP({ ...base(), hasLargestArmy: true }), 2);
});

test('longest road = +2 VP', () => {
  assert.equal(computeVP({ ...base(), hasLongestRoad: true }), 2);
});

test('combined score', () => {
  const p = { ...base(), settlementNodes: [1, 2], cityNodes: [3], hasLargestArmy: true };
  assert.equal(computeVP(p), 6); // 2 settlements + 2 city + 2 army
});

console.log(`\n${passed} tests passed\n`);
