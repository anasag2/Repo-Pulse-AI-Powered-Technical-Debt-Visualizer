// Shared animation primitives so every page/list uses the same motion language
// (the one introduced on the Learn tab). Import these instead of re-declaring.
import type { Variants } from "framer-motion";

// A smooth ease-out cubic-bezier used everywhere.
export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Stagger a container's children in.
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

// A child that rises + fades into place (pair with `stagger`).
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } },
};

// Spread onto a top-level page wrapper for a gentle enter transition.
export const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease },
};
