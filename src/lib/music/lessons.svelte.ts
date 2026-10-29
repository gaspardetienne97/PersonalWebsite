/** Intro lessons are on unless localStorage `woodshed.lessons` is "off" (the e2e suites set it). */
export const lessonsAuto = (): boolean => {
  try {
    return globalThis.localStorage?.getItem("woodshed.lessons") !== "off";
  } catch {
    return true;
  }
};
