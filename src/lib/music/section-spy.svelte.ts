// Which section of a long page you are reading: the last one whose top has
// reached the upper third of the screen, or the last section once the page is
// scrolled to its end (a short final section never reaches the top).
export class SectionSpy {
  current = $state("");
  #ids: readonly string[];

  constructor(ids: readonly string[]) {
    this.#ids = ids;
    this.current = ids[0] ?? "";
  }

  /** Call from onMount; returns the cleanup. */
  watch(): () => void {
    const update = () => {
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd) return void (this.current = this.#ids.at(-1) ?? "");
      let id = this.#ids[0] ?? "";
      for (const s of this.#ids) {
        const el = document.getElementById(s);
        if (el && el.getBoundingClientRect().top <= innerHeight * 0.3) id = s;
      }
      this.current = id;
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }
}
