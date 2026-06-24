<script lang="ts">
  let {
    xml,
    onError = () => undefined,
  }: {
    xml: string;
    onError?: (message: string) => void;
  } = $props();

  let host = $state<HTMLDivElement>();
  let status = $state<"loading" | "rendered" | "error">("loading");
  let errorMessage = $state("");

  $effect(() => {
    if (!host || !xml) return;

    let disposed = false;
    let clear = () => undefined;
    status = "loading";
    errorMessage = "";
    host.replaceChildren();

    void renderMusicXml(host, xml)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        clear = cleanup;
        status = "rendered";
      })
      .catch((error) => {
        if (disposed) return;
        const message =
          error instanceof Error
            ? `MusicXML could not be rendered: ${error.message}`
            : "MusicXML could not be rendered.";
        errorMessage = message;
        status = "error";
        onError(message);
      });

    return () => {
      disposed = true;
      clear();
      host?.replaceChildren();
    };
  });

  async function renderMusicXml(
    target: HTMLDivElement,
    content: string,
  ): Promise<() => void> {
    const document = new DOMParser().parseFromString(content, "application/xml");
    if (
      document.querySelector("parsererror") ||
      document.documentElement.localName !== "score-partwise"
    ) {
      throw new Error("Invalid score-partwise MusicXML.");
    }

    const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
    const osmd = new OpenSheetMusicDisplay(target, {
      backend: "svg",
      autoResize: false,
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawingParameters: "compacttight",
    });
    await osmd.load(content);
    osmd.render();
    return () => osmd.clear();
  }
</script>

<div
  class="min-h-48 w-full overflow-x-auto rounded-md border bg-background p-2 text-foreground [&_svg]:min-w-[320px]"
  role="img"
  aria-label="MusicXML score"
  aria-busy={status === "loading"}
  bind:this={host}
></div>

{#if status === "loading"}
  <p class="text-sm text-muted-foreground" aria-live="polite">Rendering MusicXML.</p>
{:else if status === "error"}
  <p class="text-sm text-destructive" role="alert">{errorMessage}</p>
{/if}
