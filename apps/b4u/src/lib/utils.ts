let counter = 0;

export function uid(): string {
  counter += 1;
  return `msg-${Date.now()}-${counter}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
