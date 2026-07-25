export function omit<T extends object, K extends keyof T>(source: T, keys: K[]): Omit<T, K> {
  const result = { ...source };
  for (const key of keys) delete result[key];
  return result;
}
