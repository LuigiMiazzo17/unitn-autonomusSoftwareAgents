export * from "./types";

import { BeliefSet } from "src/beliefs";
import generateIntentions from "src/intentions/generator";
import selectIntention from "src/intentions/selector";
import { Intention } from "src/intentions/types";

export function getIntention(beliefs: BeliefSet): Intention {
  return selectIntention(generateIntentions(beliefs));
}
