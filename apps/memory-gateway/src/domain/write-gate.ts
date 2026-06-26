export interface ValidateRememberInput {
  content: string;
  confirmedByUser?: boolean;
  sourceEventIds?: string[];
}

export interface WriteGateResult {
  allowed: boolean;
  reason?: string;
}

const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/,
  /\bapi[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{8,}\b/i,
  /\b(token|secret|password)\s*[:=]\s*\S{8,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];

export function validateRememberWrite(input: ValidateRememberInput): WriteGateResult {
  if (secretPatterns.some((pattern) => pattern.test(input.content))) {
    return {
      allowed: false,
      reason: "Memory content appears to contain secret material"
    };
  }

  if (!input.confirmedByUser && (!input.sourceEventIds || input.sourceEventIds.length === 0)) {
    return {
      allowed: false,
      reason: "Canonical memory requires source evidence or explicit user confirmation"
    };
  }

  return { allowed: true };
}
