import type { MidiNote } from '$lib/types/index.js';

/**
 * Maps keyboard keys to MIDI drum notes for testing without a MIDI controller
 */
export class KeyboardInputService {
	private noteHandlers: Set<(note: MidiNote) => void> = new Set();
	private isActive = false;

	// Keyboard to MIDI note mapping (simulating a drum pad layout)
	private readonly keyMap: Record<string, number> = {
		// Top row - Cymbals
		'1': 49, // Crash Cymbal 1
		'2': 57, // Crash Cymbal 2
		'3': 51, // Ride Cymbal
		'4': 55, // Splash Cymbal

		// Second row - Hi-hats
		q: 42, // Closed Hi-Hat
		w: 46, // Open Hi-Hat
		e: 44, // Pedal Hi-Hat

		// Third row - Snares
		a: 38, // Acoustic Snare
		s: 40, // Electric Snare
		d: 37, // Side Stick

		// Fourth row - Toms
		z: 41, // Low Floor Tom
		x: 45, // Low Tom
		c: 47, // Low-Mid Tom
		v: 48, // Hi-Mid Tom
		b: 50, // High Tom

		// Space - Kick drums
		' ': 36, // Bass Drum 1
		n: 35 // Acoustic Bass Drum
	};

	private handleKeyDown = (event: KeyboardEvent) => {
		// Prevent repeat events when key is held
		if (event.repeat) return;

		// Ignore if typing in an input field
		if (
			event.target instanceof HTMLInputElement ||
			event.target instanceof HTMLTextAreaElement
		) {
			return;
		}

		const key = event.key.toLowerCase();
		const note = this.keyMap[key];

		if (note !== undefined) {
			event.preventDefault();

			const midiNote: MidiNote = {
				note,
				velocity: 100, // Default velocity
				channel: 1,
				timestamp: performance.now()
			};

			this.noteHandlers.forEach((handler) => handler(midiNote));
		}
	};

	/**
	 * Start listening to keyboard events
	 */
	activate(): void {
		if (this.isActive) return;

		window.addEventListener('keydown', this.handleKeyDown);
		this.isActive = true;
		console.log('Keyboard input activated');
	}

	/**
	 * Stop listening to keyboard events
	 */
	deactivate(): void {
		if (!this.isActive) return;

		window.removeEventListener('keydown', this.handleKeyDown);
		this.isActive = false;
		console.log('Keyboard input deactivated');
	}

	/**
	 * Register a handler for note events
	 */
	onNoteOn(handler: (note: MidiNote) => void): () => void {
		this.noteHandlers.add(handler);
		return () => this.noteHandlers.delete(handler);
	}

	/**
	 * Get the keyboard mapping for display
	 */
	getKeyMap(): Record<string, { key: string; note: number; name: string }> {
		const drumNames: Record<number, string> = {
			49: 'Crash 1',
			57: 'Crash 2',
			51: 'Ride',
			55: 'Splash',
			42: 'HH Closed',
			46: 'HH Open',
			44: 'HH Pedal',
			38: 'Snare',
			40: 'E-Snare',
			37: 'Side Stick',
			41: 'Floor Tom',
			45: 'Low Tom',
			47: 'Mid Tom',
			48: 'Hi Tom',
			50: 'High Tom',
			36: 'Kick',
			35: 'Kick 2'
		};

		const result: Record<string, { key: string; note: number; name: string }> = {};

		Object.entries(this.keyMap).forEach(([key, note]) => {
			result[key] = {
				key: key === ' ' ? 'Space' : key.toUpperCase(),
				note,
				name: drumNames[note] || 'Unknown'
			};
		});

		return result;
	}

	/**
	 * Check if keyboard input is currently active
	 */
	isActivated(): boolean {
		return this.isActive;
	}
}

// Singleton export
export const keyboardInput = new KeyboardInputService();
