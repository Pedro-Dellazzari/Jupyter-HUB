import type { Variants, Transition } from "motion/react";

// ── Spring presets ─────────────────────────────────────────────────────────────

export const springs = {
  gentle: { type: "spring", stiffness: 300, damping: 30 } as Transition,
  bouncy: { type: "spring", stiffness: 400, damping: 20 } as Transition,
  snappy: { type: "spring", stiffness: 500, damping: 40 } as Transition,
};

// ── Full-motion variants ───────────────────────────────────────────────────────

export const variants = {
  slideLeft: {
    initial: { opacity: 0, x: -24 },
    animate: { opacity: 1, x: 0, transition: springs.gentle },
    // exit mirrors entrance so elements leave the same way they enter
    exit:    { opacity: 0, x: -24, transition: { duration: 0.15 } },
  } as Variants,

  slideRight: {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0, transition: springs.gentle },
    exit:    { opacity: 0, x: 24, transition: { duration: 0.15 } },
  } as Variants,

  fadeUp: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: springs.gentle },
    exit:    { opacity: 0, y: -8, transition: { duration: 0.15 } },
  } as Variants,
};

// ── Reduced-motion variants (opacity only, no spatial movement) ───────────────
// Used when useReducedMotion() returns true.
// Principle: content must still appear/disappear, but without vestibular triggers.

export const reducedVariants = {
  slideLeft: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.15 } },
    exit:    { opacity: 0, transition: { duration: 0.1 } },
  } as Variants,

  slideRight: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.15 } },
    exit:    { opacity: 0, transition: { duration: 0.1 } },
  } as Variants,

  fadeUp: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.15 } },
    exit:    { opacity: 0, transition: { duration: 0.1 } },
  } as Variants,
};

// ── Stagger containers ────────────────────────────────────────────────────────

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

// No stagger for reduced-motion — all children appear simultaneously
export const reducedStaggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0 } },
};

// ── Hover / tap ───────────────────────────────────────────────────────────────

export const hoverAnimations = {
  lift: { y: -2, scale: 1.02 },
  glow: { scale: 1.05 },
};

export const tapAnimations = {
  press: { scale: 0.96 },
};
