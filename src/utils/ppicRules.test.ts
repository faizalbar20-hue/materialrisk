import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateKekurangan,
  determineReadiness,
  calculateShortfallPositive,
  parseMaterialCodeAndName,
  calculateRiskLevel,
  isProductionNonWorkingDay,
  calculateRolling4DaysRetentionCutoff
} from './ppicRules';

test('Business Rule: Kekurangan = Diterima - Kebutuhan', () => {
  // Case 1: Diterima >= Kebutuhan (Kekurangan >= 0)
  assert.equal(calculateKekurangan(100, 80), 20);
  assert.equal(determineReadiness(calculateKekurangan(100, 80)), 'READY');

  // Case 2: Diterima == Kebutuhan (Kekurangan == 0)
  assert.equal(calculateKekurangan(50.5, 50.5), 0);
  assert.equal(determineReadiness(calculateKekurangan(50.5, 50.5)), 'READY');

  // Case 3: Diterima < Kebutuhan (Kekurangan < 0 => BELUM READY)
  assert.equal(calculateKekurangan(40, 100), -60);
  assert.equal(determineReadiness(calculateKekurangan(40, 100)), 'BELUM READY');

  // Case 4: Decimals precision
  assert.equal(calculateKekurangan(12.345, 10.123), 2.22);
});

test('Business Rule: Shortfall Positive quantity for Pareto', () => {
  assert.equal(calculateShortfallPositive(40, 100), 60);
  assert.equal(calculateShortfallPositive(120, 100), 0);
  assert.equal(calculateShortfallPositive(0, 50), 50);
});

test('Parser: Preserves leading zero, special symbols, and brackets', () => {
  // Bracket pattern with leading zero
  const p1 = parseMaterialCodeAndName('[00412-FAB] Cotton Combed 30s Black Reactive');
  assert.equal(p1.materialCode, '00412-FAB');
  assert.equal(p1.materialName, 'Cotton Combed 30s Black Reactive');
  assert.equal(p1.isFlaggedForReview, false);

  // Dash separator with leading zeros and slashes
  const p2 = parseMaterialCodeAndName('0099/POL-01 - Polyester Rib 1x1');
  assert.equal(p2.materialCode, '0099/POL-01');
  assert.equal(p2.materialName, 'Polyester Rib 1x1');
  assert.equal(p2.isFlaggedForReview, false);

  // Colon separator
  const p3 = parseMaterialCodeAndName('ZIP-YKK-05 : Metal Zipper Antique Brass 18cm');
  assert.equal(p3.materialCode, 'ZIP-YKK-05');
  assert.equal(p3.materialName, 'Metal Zipper Antique Brass 18cm');
  assert.equal(p3.isFlaggedForReview, false);

  // Fallback for plain text without distinct code pattern -> flagged for review as required!
  const p4 = parseMaterialCodeAndName('Generic Untagged Carton Box');
  assert.equal(p4.isFlaggedForReview, true);
  assert.equal(p4.rawDisplayName, 'Generic Untagged Carton Box');
});

test('Risk categorization evaluation', () => {
  // Critical: starts within 2 days with deficits
  assert.equal(calculateRiskLevel(1, 0.5, 3), 'CRITICAL RISK');
  // High: starts in 4 days with low readiness
  assert.equal(calculateRiskLevel(4, 0.7, 2), 'HIGH RISK');
  // Medium: starts in 6 days
  assert.equal(calculateRiskLevel(6, 0.85, 1), 'MEDIUM RISK');
  // Low: 100% ready or 0 deficits
  assert.equal(calculateRiskLevel(2, 1.0, 0), 'LOW RISK');
});

test('Holiday and Sunday detection', () => {
  // 2026-08-17 is Indonesian Independence Day
  const holiday = isProductionNonWorkingDay('2026-08-17');
  assert.equal(holiday.isNonWorking, true);
  assert.match(holiday.reason || '', /Kemerdekaan/);

  // Sunday check (e.g. 2026-08-16 is Sunday)
  const sunday = isProductionNonWorkingDay('2026-08-16');
  assert.equal(sunday.isNonWorking, true);
  assert.match(sunday.reason || '', /Minggu/);

  // Normal working day (e.g. 2026-08-18 Tuesday)
  const normal = isProductionNonWorkingDay('2026-08-18');
  assert.equal(normal.isNonWorking, false);
});

test('Rolling 4-Hari retention cutoff', () => {
  const ref = new Date('2026-11-06T12:00:00Z');
  const cutoff = calculateRolling4DaysRetentionCutoff(ref);
  // Cutoff should be 4 days earlier: 2026-11-02
  assert.equal(cutoff.getDate(), 2);
  assert.equal(cutoff.getMonth(), 10); // November is 10 (0-indexed)
});
