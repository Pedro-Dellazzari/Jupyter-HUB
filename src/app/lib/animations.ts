import type { Variants, Transition } from "motion/react";

export const springs = {
  gentle: { type: "spring", stiffness: 300, damping: 30 } as Transition,
  bouncy: { type: "spring", stiffness: 400, damping: 20 } as Transition,
  snappy: { type: "spring", stiffness: 500, damping: 40 } as Transition,
};

export const variants = {
  slideLeft: {
    initial: { opacity: 0, x: -24 },
    animate: { opacity: 1, x: 0, transition: springs.gentle },
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

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

export const hoverAnimations = {
  lift: { y: -2, scale: 1.02 },
  glow: { scale: 1.05 },
};

export const tapAnimations = {
  press: { scale: 0.96 },
};
