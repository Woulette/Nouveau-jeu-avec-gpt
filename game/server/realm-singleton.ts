import { InMemoryRealm } from "./realm";

declare global {
  var __nouveauMmoRealm: InMemoryRealm | undefined;
}

export function getRealm(): InMemoryRealm {
  if (!globalThis.__nouveauMmoRealm) {
    globalThis.__nouveauMmoRealm = new InMemoryRealm();
  }
  return globalThis.__nouveauMmoRealm;
}
