<script lang="ts">
	let {
		nodeCount = 200,
		maxIterations = 200,
		debug = true,
		animationSpeed = 25,
		startAnimation = $bindable()
	} = $props();

	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let currentIteration = $state(0);
	let tree = $state<Node[]>([]);
	let nodes = $state<Node[]>([]);
	let animationInterval: number | null = $state(null);
	let isAnimating = $state(false);
	class Node {
		x: number;
		y: number;
		parent: Node | null;
		children: Node[];

		constructor(x: number, y: number) {
			this.x = x;
			this.y = y;
			this.parent = null;
			this.children = [];
		}
	}

	function distance(a: Node, b: Node): number {
		return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
	}

	function generateNodes(): Node[] {
		if (debug) {
			console.log('initializeCircuit', { tree, nodes, containerHeight, containerWidth });
		}
		return Array.from(
			{ length: nodeCount },
			() => new Node(Math.random() * containerWidth, Math.random() * containerHeight)
		);
	}

	function roundToAngle(dx: number, dy: number): { dx: number; dy: number } {
		const angle = Math.atan2(dy, dx);
		const snapAngle = Math.PI / 4; // 45 degrees
		const roundedAngle = Math.round(angle / snapAngle) * snapAngle;
		return {
			dx: Math.cos(roundedAngle),
			dy: Math.sin(roundedAngle)
		};
	}

	const maxDistance = $derived(Math.min(containerWidth, containerHeight) / 4);
	const minDistance = 10;
	const branchLength = 10;

	function initializeCircuit() {
		const root = new Node(containerWidth / 2, containerHeight / 2);
		tree = [root];
		nodes = generateNodes();
		if (debug) {
			console.log('initializeCircuit', { root, tree, nodes, containerHeight, containerWidth });
		}
	}

	function growCircuit() {
		const influences: { [key: number]: { x: number; y: number; count: number } } = {};

		for (const node of nodes) {
			let closestBranchIndex: number | null = null;
			let closestDistance = Infinity;

			for (let i = 0; i < tree.length; i++) {
				const branch = tree[i];
				const dist = distance(node, branch);

				if (dist < closestDistance && dist < maxDistance) {
					closestDistance = dist;
					closestBranchIndex = i;
				}
			}

			if (closestBranchIndex !== null && closestDistance > minDistance) {
				if (!influences[closestBranchIndex]) {
					influences[closestBranchIndex] = { x: 0, y: 0, count: 0 };
				}
				const influence = influences[closestBranchIndex];
				influence.x += node.x - tree[closestBranchIndex].x;
				influence.y += node.y - tree[closestBranchIndex].y;
				influence.count++;
			}
		}

		let newBranchesAdded = 0;
		const newTree = [...tree];
		for (const [index, influence] of Object.entries(influences)) {
			if (influence.count > 0) {
				const i = parseInt(index);
				const dx = influence.x / influence.count;
				const dy = influence.y / influence.count;

				const { dx: roundedDx, dy: roundedDy } = roundToAngle(dx, dy);

				const newBranch = new Node(
					tree[i].x + roundedDx * branchLength,
					tree[i].y + roundedDy * branchLength
				);
				newBranch.parent = tree[i];
				newTree[i].children.push(newBranch);
				newTree.push(newBranch);
				newBranchesAdded++;
			}
		}
		tree = newTree;
		return newBranchesAdded;
	}

	const branches = $derived(
		tree.reduce((prev: { x1: number; y1: number; x2: number; y2: number }[], node) => {
			if (node.parent) {
				prev.push({
					x1: node.parent.x,
					y1: node.parent.y,
					x2: node.x,
					y2: node.y
				});
			}
			return prev;
		}, [])
	);

	let leafNodes = $derived(
		tree.filter((node) => node.children.length === 0).map((node) => ({ x: node.x, y: node.y }))
	);

	let debugInfo = $derived.by(() => {
		const info = { nodeCount: tree.length, minX: 0, minY: 0, maxX: 0, maxY: 0 };
		if (tree.length > 0) {
			info.minX = Math.min(...tree.map((n) => n.x));
			info.minY = Math.min(...tree.map((n) => n.y));
			info.maxX = Math.max(...tree.map((n) => n.x));
			info.maxY = Math.max(...tree.map((n) => n.y));
		}
		return info;
	});

	function generatePath(tree: Node[]): string {
		let path = '';
		for (const node of tree) {
			if (node.parent) {
				const dx = node.x - node.parent.x;
				const dy = node.y - node.parent.y;
				const midX = node.parent.x + dx / 2;
				const midY = node.parent.y + dy / 2;

				if (Math.abs(dx) === Math.abs(dy)) {
					// 45-degree angle, draw a direct line
					path += `M${node.parent.x},${node.parent.y} L${node.x},${node.y} `;
				} else {
					// Not 45-degree, add a corner
					path += `M${node.parent.x},${node.parent.y} L${midX},${midY} L${node.x},${node.y} `;
				}
			}
		}
		return path;
	}

	// Add this derived state for the continuous path
	const continuousPath = $derived(generatePath(tree));

	// Add this function to generate a gradient based on the tree structure
	function generateGradient(tree: Node[]): {
		stops: { offset: string; color: string }[];
		id: string;
	} {
		const maxDepth = Math.max(...tree.map((node) => getNodeDepth(node)));
		const stops = Array.from({ length: maxDepth + 1 }, (_, i) => ({
			offset: `${(i / maxDepth) * 100}%`,
			color: `hsl(${120 + (i / maxDepth) * 240}, 100%, 50%)`
		}));
		return { stops, id: 'branch-gradient' };
	}

	function getNodeDepth(node: Node): number {
		let depth = 0;
		let current = node;
		while (current.parent) {
			depth++;
			current = current.parent;
		}
		return depth;
	}

	// Add this derived state for the gradient
	const gradient = $derived(generateGradient(tree));
	function animate() {
		if (currentIteration < maxIterations) {
			const newBranches = growCircuit();
			currentIteration++;

			if (newBranches === 0) {
				console.log(`Animation stopped at iteration ${currentIteration}`);
				stopAnimation();
			}
		} else {
			stopAnimation();
		}
	}

	startAnimation = () => {
		if (!isAnimating) {
			isAnimating = true;
			initializeCircuit();
			animationInterval = setInterval(animate, animationSpeed);
		}
	};

	function stopAnimation() {
		if (isAnimating) {
			isAnimating = false;
			if (animationInterval !== null) {
				clearInterval(animationInterval);
				animationInterval = null;
			}
		}
	}

	function handleResize(entries: ResizeObserverEntry[]) {
		const entry = entries[0];
		if (entry) {
			containerWidth = entry.contentRect.width;
			containerHeight = entry.contentRect.height;
			if (!isAnimating) {
				initializeCircuit();
			}
		}
	}

	function observeResize(node: HTMLElement, callback: (entries: ResizeObserverEntry[]) => void) {
		const resizeObserver = new ResizeObserver(callback);
		resizeObserver.observe(node);

		return {
			destroy() {
				resizeObserver.disconnect();
			}
		};
	}
</script>

<div
	id="circuit"
	class="absolute inset-0 -z-10 h-full w-full"
	bind:clientHeight={containerHeight}
	bind:clientWidth={containerWidth}
	use:observeResize={handleResize}
>
	<svg class="h-full w-full" viewBox="0 0 {containerWidth} {containerHeight}">
		<defs>
			<linearGradient
				id={gradient.id}
				gradientUnits="userSpaceOnUse"
				x1="0"
				y1="0"
				x2="0"
				y2="100%"
			>
				{#each gradient.stops as stop}
					<stop offset={stop.offset} stop-color={stop.color} />
				{/each}
			</linearGradient>
		</defs>
		<rect width="100%" height="100%" fill="transparent" />
		<path d={continuousPath} stroke="url(#{gradient.id})" stroke-width="5" fill="none" />
		{#each leafNodes as leaf}
			<circle cx={leaf.x} cy={leaf.y} r="5" stroke="red" fill="gold" />
		{/each}
		{#if debug && tree.length > 0}
			<rect
				x={debugInfo.minX}
				y={debugInfo.minY}
				width={debugInfo.maxX - debugInfo.minX}
				height={debugInfo.maxY - debugInfo.minY}
				fill="none"
				stroke="blue"
				stroke-opacity="0.5"
			/>
			<circle
				cx={containerWidth / 2}
				cy={containerHeight / 2}
				r="5"
				fill="red"
				fill-opacity="0.5"
			/>
			<text x="10" y="20" font-size="12" fill="blue">Total nodes: {debugInfo.nodeCount}</text>
			<text x="10" y="40" font-size="12" fill="blue">Iteration: {currentIteration}</text>
			<text x="10" y="60" font-size="12" fill="blue">
				Bounding box: ({debugInfo.minX.toFixed(2)}, {debugInfo.minY.toFixed(2)}) to ({debugInfo.maxX.toFixed(
					2
				)}, {debugInfo.maxY.toFixed(2)})
			</text>
		{/if}
	</svg>
</div>
