import { UnavailableIncident } from "./access";

// Keep API concurrency bounded. Only permission/not-found responses may be omitted.
// A failed search must never masquerade as an empty or complete population.
export async function accessiblePopulation<T>(
  keys: string[],
  read: (key: string) => Promise<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; start < keys.length; start += 5) {
    const batch = await Promise.allSettled(
      keys.slice(start, start + 5).map(read),
    );
    for (const result of batch) {
      if (result.status === "fulfilled") out.push(result.value);
      else if (!(result.reason instanceof UnavailableIncident))
        throw new Error(
          "The incident population could not be checked completely. Refresh when Jira and Forge storage are available.",
        );
    }
  }
  return out;
}
