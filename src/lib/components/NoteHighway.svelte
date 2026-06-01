<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { LessonNote, NoteResult, HitStatus } from '$lib/types/index.js';

	// Props
	export let notes: LessonNote[] = [];
	export let currentTime: number = 0;
	export let lookAhead: number = 2000;
	export let results: Map<number, NoteResult> = new Map();
	export let partsEnabled = {
		kick: true,
		snare: true,
		hihat: true,
		toms: true,
		cymbals: true,
		percussion: true
	};

	// Canvas
	let canvas = undefined as unknown as HTMLCanvasElement;
	let ctx = undefined as unknown as CanvasRenderingContext2D;
	let animationFrame: number;
	let width = 800;
	let height = 500;

	// Constants
	const HIT_LINE_Y_RATIO = 0.85;
	const PAD_SIZE = 50;
	const PAD_GAP = 8;
	const COLUMNS = 4;

	// Color mapping for feedback
	const statusColors: Record<HitStatus, string> = {
		perfect: '#00ff88',
		good: '#88ff00',
		early: '#ffaa00',
		late: '#ff8800',
		miss: '#ff0044'
	};

	// Default pad colors
	const padColors = [
		'#FF6B6B',
		'#4ECDC4',
		'#45B7D1',
		'#96CEB4',
		'#FFEAA7',
		'#DDA0DD',
		'#98D8C8',
		'#F7DC6F',
		'#BB8FCE',
		'#85C1E9',
		'#F8B500',
		'#00CED1',
		'#FF69B4',
		'#7FFFD4',
		'#FFD700',
		'#00FA9A'
	];

	// Note name mapping (GM Drum Map)
	const noteNames: Record<number, string> = {
		35: 'Kick 2',
		36: 'Kick',
		37: 'Stick',
		38: 'Snare',
		39: 'Clap',
		40: 'E-Snare',
		41: 'F Tom',
		42: 'HH Cls',
		43: 'HF Tom',
		44: 'HH Pd',
		45: 'L Tom',
		46: 'HH Opn',
		47: 'LM Tom',
		48: 'HM Tom',
		49: 'Crash1',
		50: 'H Tom',
		51: 'Ride',
		52: 'China',
		53: 'Bell',
		54: 'Tamb',
		55: 'Splash',
		56: 'Cowbell',
		57: 'Crash2',
		58: 'Vibraslap',
		59: 'Ride 2'
	};

	function getNoteName(note: number): string {
		return noteNames[note] || `N${note}`;
	}

	// Note to column mapping (simplified - maps note to column 0-3)
	function getNoteColumn(note: number): number {
		// Group drums by type
		if ([35, 36].includes(note)) return 0; // Kicks
		if ([38, 40, 37, 39].includes(note)) return 1; // Snares/claps
		if ([42, 44, 46].includes(note)) return 2; // Hi-hats
		return 3; // Everything else (toms, cymbals)
	}

	// Note to color mapping
	function getNoteColor(note: number): string {
		const col = getNoteColumn(note);
		return padColors[col];
	}

	// Check if note is in enabled parts
	function isNoteEnabled(note: number): boolean {
		if ([35, 36].includes(note)) return partsEnabled.kick;
		if ([38, 40, 37, 39].includes(note)) return partsEnabled.snare;
		if ([42, 44, 46].includes(note)) return partsEnabled.hihat;
		if ([41, 43, 45, 47, 48, 50].includes(note)) return partsEnabled.toms;
		if ([49, 51, 52, 53, 55, 57, 59].includes(note)) return partsEnabled.cymbals;
		return partsEnabled.percussion;
	}

	onMount(() => {
		ctx = canvas.getContext('2d')!;
		resizeCanvas();
		window.addEventListener('resize', resizeCanvas);
		startRenderLoop();
	});

	onDestroy(() => {
		window.removeEventListener('resize', resizeCanvas);
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
	});

	function resizeCanvas() {
		const container = canvas.parentElement;
		if (container) {
			width = container.clientWidth;
			height = container.clientHeight;
			canvas.width = width;
			canvas.height = height;
		}
	}

	function startRenderLoop() {
		function render() {
			draw();
			animationFrame = requestAnimationFrame(render);
		}
		render();
	}

	function draw() {
		if (!ctx) return;

		const hitLineY = height * HIT_LINE_Y_RATIO;
		const laneWidth = PAD_SIZE + PAD_GAP;
		const startX = (width - COLUMNS * laneWidth) / 2;

		// Clear
		ctx.fillStyle = '#1a1a2e';
		ctx.fillRect(0, 0, width, height);

		// Draw lane lines
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.lineWidth = 1;
		for (let i = 0; i <= COLUMNS; i++) {
			ctx.beginPath();
			ctx.moveTo(startX + i * laneWidth - PAD_GAP / 2, 0);
			ctx.lineTo(startX + i * laneWidth - PAD_GAP / 2, height);
			ctx.stroke();
		}

		// Draw hit line
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(startX - 20, hitLineY);
		ctx.lineTo(startX + COLUMNS * laneWidth + 20, hitLineY);
		ctx.stroke();

		// Draw hit zone glow
		const gradient = ctx.createLinearGradient(0, hitLineY - 30, 0, hitLineY + 30);
		gradient.addColorStop(0, 'rgba(99, 102, 241, 0)');
		gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.3)');
		gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
		ctx.fillStyle = gradient;
		ctx.fillRect(startX - 20, hitLineY - 30, COLUMNS * laneWidth + 40, 60);

		// Draw notes
		for (let i = 0; i < notes.length; i++) {
			const note = notes[i];
			const relativeTime = note.time - currentTime;

			// Skip notes outside visible range
			if (relativeTime < -500 || relativeTime > lookAhead) continue;

			// Check if note is in enabled parts
			const enabled = isNoteEnabled(note.note);

			// Calculate position
			const progress = 1 - relativeTime / lookAhead;
			const y = progress * hitLineY;
			const col = getNoteColumn(note.note);
			const x = startX + col * laneWidth;

			// Get result if exists
			const result = results.get(i);

			// Draw note
			drawNote(x, y, note, enabled, result);
		}

		// Draw column indicators at hit line
		for (let i = 0; i < COLUMNS; i++) {
			const x = startX + i * laneWidth;
			ctx.fillStyle = `${padColors[i]}40`;
			ctx.beginPath();
			ctx.arc(x + PAD_SIZE / 2, hitLineY, PAD_SIZE / 2 + 5, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw column labels below hit line
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 12px monospace';
		ctx.textAlign = 'center';
		const labels = ['KICK', 'SNARE', 'HH', 'TOMS'];
		for (let i = 0; i < COLUMNS; i++) {
			const x = startX + i * laneWidth + PAD_SIZE / 2;
			ctx.fillText(labels[i], x, hitLineY + 30);
		}
	}

	function drawNote(
		x: number,
		y: number,
		note: LessonNote,
		enabled: boolean,
		result?: NoteResult
	) {
		const size = PAD_SIZE;
		const noteHeight = 15 + (note.velocity / 127) * 15;

		// Determine color
		let color = getNoteColor(note.note);
		let alpha = enabled ? 'cc' : '44';

		if (result) {
			color = statusColors[result.status];
			alpha = 'ff';
		}

		// Draw note rectangle
		ctx.fillStyle = color + alpha;
		ctx.beginPath();
		roundRect(ctx, x, y - noteHeight / 2, size, noteHeight, 4);
		ctx.fill();

		// Draw border
		ctx.strokeStyle = color;
		ctx.lineWidth = enabled ? 2 : 1;
		ctx.stroke();

		// Draw glow for recent hits
		if (result && result.status !== 'miss') {
			ctx.shadowColor = color;
			ctx.shadowBlur = 15;
			ctx.fill();
			ctx.shadowBlur = 0;
		}

		// Draw note name
		ctx.shadowBlur = 0;
		ctx.fillStyle = '#000000';
		ctx.font = 'bold 10px monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const noteName = getNoteName(note.note);
		ctx.fillText(noteName, x + size / 2, y);
	}

	function roundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number
	) {
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
	}
</script>

<div class="w-full h-full min-h-[400px]">
	<canvas bind:this={canvas} class="w-full h-full rounded-lg"></canvas>
</div>
