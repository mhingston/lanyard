export function mergeStringArrays(
  existing: unknown,
  required: readonly string[],
  fieldName: string,
): string[] {
  if (existing === undefined) {
    return [...required];
  }

  if (!Array.isArray(existing) || existing.some((item) => typeof item !== "string")) {
    throw new Error(`Expected ${fieldName} to be an array of strings.`);
  }

  const merged = [...existing];
  for (const value of required) {
    if (!merged.includes(value)) {
      merged.push(value);
    }
  }

  return merged;
}

export function matchesStringArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => typeof item === "string" && item === expected[index])
  );
}
