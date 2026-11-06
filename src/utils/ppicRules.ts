/**
 * PPIC Business Rules & Utility Calculations
 * Strictly follows business specifications:
 * - Kekurangan = Diterima - Kebutuhan
 * - Kekurangan >= 0 => 'READY'
 * - Kekurangan < 0 => 'BELUM READY'
 * - Actual shortfall for Pareto/Risk: Math.max(0, Kebutuhan - Diterima)
 * - Material code & name parser preserving leading zeroes, special chars, text integrity
 * - Indonesian holidays and Sunday production skips
 * - Rolling 4-Hari retention cutoff calculation
 */

export interface ParsedMaterial {
  materialCode: string;
  materialName: string;
  isFlaggedForReview: boolean;
  rawDisplayName: string;
}

export type ReadinessStatus = 'READY' | 'BELUM READY';
export type RiskCategory = 'CRITICAL RISK' | 'HIGH RISK' | 'MEDIUM RISK' | 'LOW RISK';

/**
 * Business Rule: Kekurangan = Diterima - Kebutuhan
 */
export function calculateKekurangan(diterima: number, kebutuhan: number): number {
  const d = Number(diterima) || 0;
  const k = Number(kebutuhan) || 0;
  // Preserve decimal precision (2 decimal places)
  return Math.round((d - k) * 100) / 100;
}

/**
 * Business Rule:
 * Kekurangan >= 0: READY
 * Kekurangan < 0: BELUM READY
 */
export function determineReadiness(kekurangan: number): ReadinessStatus {
  return kekurangan >= 0 ? 'READY' : 'BELUM READY';
}

/**
 * Positive shortfall quantity for Pareto charts & shortage analysis:
 * Shortfall = Math.max(0, Kebutuhan - Diterima)
 */
export function calculateShortfallPositive(diterima: number, kebutuhan: number): number {
  const d = Number(diterima) || 0;
  const k = Number(kebutuhan) || 0;
  return k > d ? Math.round((k - d) * 100) / 100 : 0;
}

/**
 * Parse Product / Display Name into Material Code and Material Name:
 * - Preserves leading zeroes (TEXT format)
 * - Preserves special characters (e.g. [MAT-0012], MAT/2026/01, 001928-FABRIC)
 * - Detects common ERP export patterns (e.g., "[CODE] Name", "CODE - Name", "CODE / Name", "CODE: Name")
 * - If code pattern is unrecognized, stores raw display name and flags for review without inventing codes
 */
export function parseMaterialCodeAndName(displayName: string | null | undefined): ParsedMaterial {
  if (!displayName || typeof displayName !== 'string') {
    return {
      materialCode: 'UNSPECIFIED',
      materialName: 'Material Tidak Diketahui',
      isFlaggedForReview: true,
      rawDisplayName: displayName || '',
    };
  }

  const trimmed = displayName.trim();

  // Pattern 1: [CODE] Description, e.g. "[00412-FAB] Cotton Combed 30s Black"
  const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    const code = bracketMatch[1].trim();
    const name = bracketMatch[2].trim() || code;
    return {
      materialCode: code,
      materialName: name,
      isFlaggedForReview: false,
      rawDisplayName: trimmed,
    };
  }

  // Pattern 2: CODE - Description (or CODE : Description / CODE | Description)
  // Code must start with alphanumeric or symbol and not be a common sentence word
  const separatorMatch = trimmed.match(/^([A-Za-z0-9_\-\.\/]+)\s*[\-:\/|]\s*(.+)$/);
  if (separatorMatch) {
    const code = separatorMatch[1].trim();
    const name = separatorMatch[2].trim();
    if (code.length >= 2 && name.length >= 1) {
      return {
        materialCode: code,
        materialName: name,
        isFlaggedForReview: false,
        rawDisplayName: trimmed,
      };
    }
  }

  // Pattern 3: Starts with alphanumeric token of 3+ chars containing digits or uppercase letters
  const tokenMatch = trimmed.match(/^([A-Z0-9_\-\.]{3,30})\s+(.+)$/);
  if (tokenMatch) {
    const code = tokenMatch[1].trim();
    const name = tokenMatch[2].trim();
    return {
      materialCode: code,
      materialName: name,
      isFlaggedForReview: false,
      rawDisplayName: trimmed,
    };
  }

  // If no confident separator was matched, don't invent code
  return {
    materialCode: trimmed.slice(0, 20),
    materialName: trimmed,
    isFlaggedForReview: true,
    rawDisplayName: trimmed,
  };
}

/**
 * Calculate Risk Level for Production Schedule based on:
 * - Days remaining until production start
 * - Readiness ratio (total diterima / total kebutuhan)
 * - Deficit item count
 */
export function calculateRiskLevel(
  daysRemaining: number,
  readinessRatio: number,
  deficitItemCount: number
): RiskCategory {
  // If no materials are missing, it's low risk regardless of schedule
  if (deficitItemCount === 0 || readinessRatio >= 1) {
    return 'LOW RISK';
  }

  // Production is starting in 2 days or less and materials are missing => CRITICAL
  if (daysRemaining <= 2 && deficitItemCount > 0) {
    return 'CRITICAL RISK';
  }

  // Production in 3-5 days with significant deficit (<80% ready) => HIGH RISK
  if (daysRemaining <= 5 && (readinessRatio < 0.8 || deficitItemCount >= 3)) {
    return 'HIGH RISK';
  }

  // Production in <= 7 days or readiness < 90% => MEDIUM RISK
  if (daysRemaining <= 7 || readinessRatio < 0.95) {
    return 'MEDIUM RISK';
  }

  return 'LOW RISK';
}

/**
 * Standard Indonesian National Holidays & Sundays check
 */
export const INDONESIAN_HOLIDAYS: Record<string, string> = {
  '2026-01-01': 'Tahun Baru 2026 Masehi',
  '2026-01-16': 'Isra Mi\'raj Nabi Muhammad SAW',
  '2026-02-17': 'Tahun Baru Imlek 2577 Kongzili',
  '2026-03-20': 'Hari Raya Idul Fitri 1447 H (Hari Pertama)',
  '2026-03-21': 'Hari Suci Nyepi Tahun Baru Saka 1948',
  '2026-03-22': 'Hari Raya Idul Fitri 1447 H (Hari Kedua)',
  '2026-04-03': 'Wafat Isa Almasih',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Isa Almasih',
  '2026-05-31': 'Hari Raya Waisak 2570 BE',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Hari Raya Idul Adha 1447 H',
  '2026-07-07': 'Tahun Baru Islam 1448 H',
  '2026-08-17': 'Hari Kemerdekaan RI Ke-81',
  '2026-09-15': 'Maulid Nabi Muhammad SAW',
  '2026-12-25': 'Hari Raya Natal',
};

export function isSunday(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d.getUTCDay() === 0; // 0 is Sunday
}

export function isHoliday(dateStr: string): boolean {
  const key = dateStr.slice(0, 10);
  return !!INDONESIAN_HOLIDAYS[key];
}

export function isProductionNonWorkingDay(dateStr: string): { isNonWorking: boolean; reason?: string } {
  const key = dateStr.slice(0, 10);
  if (isSunday(key)) {
    return { isNonWorking: true, reason: 'Hari Minggu (Libur Rutin)' };
  }
  if (INDONESIAN_HOLIDAYS[key]) {
    return { isNonWorking: true, reason: INDONESIAN_HOLIDAYS[key] };
  }
  return { isNonWorking: false };
}

/**
 * Rolling 4 Hari retention cutoff calculation:
 * Uploads older than 4 calendar days (96 hours) from reference date
 */
export function calculateRolling4DaysRetentionCutoff(referenceDate: Date = new Date()): Date {
  const cutoff = new Date(referenceDate.getTime());
  cutoff.setDate(cutoff.getDate() - 4);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}
