class Palette {
  isOpen = $state(false);
  open() {
    this.isOpen = true;
  }
  close() {
    this.isOpen = false;
  }
}
export const palette = new Palette();
