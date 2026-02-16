export function fuzzyMatch(query: string, target: string): { matches: boolean; score: number; indices: number[] } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      // Bonus for consecutive matches
      if (indices.length > 1 && indices[indices.length - 1] - indices[indices.length - 2] === 1) {
        score += 2;
      }
      // Bonus for matching at separator boundaries
      if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === "." || t[ti - 1] === "-" || t[ti - 1] === "_") {
        score += 3;
      }
      score += 1;
      qi++;
    }
  }

  return { matches: qi === q.length, score, indices };
}
