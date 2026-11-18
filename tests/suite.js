import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { splitMessages } from '../src/split.js';
import { buildPlan, validateAndApplyMessage } from '../src/engine.js';
import { getEmptyState } from '../src/state.js';
import { readMessages } from '../src/reader.js';

process.env.MOCK_READER = '1';

async function runTestSuite() {
  console.log('--- STARTING ENGINE TEST SUITE ---');

  // Test 1: Sample Pack passes all 6 checks
  console.log('\n[Test 1] Running Sample Pack (8 messages)...');
  const sampleRaw = fs.readFileSync(path.resolve('tests', 'sample_messages.txt'), 'utf-8');
  const sampleSplit = splitMessages(sampleRaw);
  assert.strictEqual(sampleSplit.length, 8, 'Should split into 8 messages');

  const { result: readerResult } = await readMessages(sampleSplit, 1);
  assert.strictEqual(readerResult.messages.length, 8, 'Reader should extract 8 messages');

  const planResult = buildPlan(readerResult.messages);
  console.log('Feed count calculated:', planResult.feed);
  assert.strictEqual(planResult.feed, 177, 'Feed count must be 177');

  // Verify all 6 checks
  assert.strictEqual(planResult.checks.length, 6, 'Must have exactly 6 checks');
  for (const check of planResult.checks) {
    console.log(`  Check '${check.name}': ${check.ok ? 'PASS' : 'FAIL'} (${check.detail})`);
    assert.ok(check.ok, `Check '${check.name}' must PASS`);
  }

  // Verify Venue chosen is Hall A (Rs 120,000)
  assert.strictEqual(planResult.plan.venue.name, 'Hall A');
  assert.strictEqual(planResult.plan.budget.total, 547400);

  // Test 2: Update Expense (Printing Rs 15,000)
  console.log('\n[Test 2] Testing Expense Update (Printing Rs 15,000)...');
  const updateMsg = {
    id: 9,
    sender: 'Finance, email',
    date: '15 Nov',
    relevant: true,
    reason: '',
    text: 'Finance here. The printing bill came in at Rs 15,000, not Rs 10,000.',
    facts: [{ kind: 'expense', item: 'printing', amount: 15000 }]
  };

  const validation1 = validateAndApplyMessage(readerResult.messages, updateMsg, getEmptyState());
  assert.ok(validation1.ok, 'Update should be valid');
  assert.strictEqual(validation1.result.plan.budget.total, 552400, 'Budget should be 552,400 (547,400 + 5,000)');
  console.log('  Updated budget total:', validation1.result.plan.budget.total, '-> OK');

  // Test 3: Reject Caterer claim of 100 boxes (< 177)
  console.log('\n[Test 3] Testing Invalid Caterer Claim (100 boxes < 177 people)...');
  const invalidFoodMsg = {
    id: 10,
    sender: 'Caterer, WhatsApp',
    date: '16 Nov',
    relevant: true,
    reason: '',
    text: 'Caterer: I have rounded your order down to 100 boxes to keep the cost low.',
    facts: [{ kind: 'claim', about: 'food_quantity', value: 100 }]
  };

  const validation2 = validateAndApplyMessage(readerResult.messages, invalidFoodMsg, getEmptyState());
  assert.strictEqual(validation2.ok, false, 'Invalid claim must be REJECTED');
  console.log('  Rejection reason:', validation2.rejectionReason);
  assert.ok(validation2.rejectionReason.includes('quantity 100 is less than 177 people to feed'));

  // Test 4: Unknown constraint must not crash
  console.log('\n[Test 4] Testing Unknown Constraint...');
  const unknownConstraintMsg = {
    id: 11,
    sender: 'Organizer, email',
    date: '16 Nov',
    relevant: true,
    reason: '',
    text: 'Special constraint: Must have high ceilings for drone display.',
    facts: [{ kind: 'constraint', area: 'venue', rule: 'Must have high ceilings for drone display' }]
  };

  const validation3 = validateAndApplyMessage(readerResult.messages, unknownConstraintMsg, getEmptyState());
  assert.ok(validation3.ok, 'Unknown constraint should not crash or fail checks');
  assert.ok(validation3.result.notes.some(n => n.includes('unhandled constraint')), 'Must record unhandled constraint in notes');
  console.log('  Plan notes:', validation3.result.notes);

  console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
