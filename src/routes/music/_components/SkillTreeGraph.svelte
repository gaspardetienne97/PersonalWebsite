<script lang="ts">
  import SkillRing from "./SkillRing.svelte";

  type Node = { label: string; percent: number };

  let {
    root,
    nodes,
    height = 260,
    class: cls = "",
  }: {
    root: Node;
    nodes: Node[];
    height?: number;
    class?: string;
  } = $props();

  // Children spread evenly across a lower row; root sits centered up top.
  const children = $derived(nodes.slice(0, 6));
  const positions = $derived(
    children.map((node, index) => ({
      node,
      x: ((index + 1) / (children.length + 1)) * 100,
      y: 72,
    })),
  );
  const rootX = 50;
  const rootY = 18;
</script>

<div class="relative w-full {cls}" style="height:{height}px" aria-label="Skill tree snapshot">
  <svg
    class="absolute inset-0 h-full w-full"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {#each positions as position}
      <path
        d="M {rootX} {rootY} C {rootX} {(rootY + position.y) / 2}, {position.x} {(rootY + position.y) / 2}, {position.x} {position.y}"
        fill="none"
        stroke="currentColor"
        stroke-width="0.4"
        class="text-border"
        vector-effect="non-scaling-stroke"
      />
    {/each}
  </svg>

  <!-- root node -->
  <div
    class="absolute -translate-x-1/2 -translate-y-1/2"
    style="left:{rootX}%;top:{rootY}%"
  >
    <SkillRing percent={root.percent} label={root.label} size={72} strokeWidth={6} />
  </div>

  <!-- child nodes -->
  {#each positions as position}
    <div
      class="absolute -translate-x-1/2 -translate-y-1/2"
      style="left:{position.x}%;top:{position.y}%"
    >
      <SkillRing percent={position.node.percent} label={position.node.label} size={58} />
    </div>
  {/each}
</div>
