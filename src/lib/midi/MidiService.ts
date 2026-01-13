import { midiState } from '$lib/stores/index.js';
import type { MidiDevice, MidiNote } from '$lib/types/index.js';

class MidiService {
	private midiAccess: MIDIAccess | null = null;
	private activeInput: MIDIInput | null = null;
	private noteHandlers: Set<(note: MidiNote) => void> = new Set();
	private noteOffHandlers: Set<(note: MidiNote) => void> = new Set();

	async initialize(): Promise<boolean> {
		// Check for Web MIDI support
		if (!navigator.requestMIDIAccess) {
			midiState.update((s) => ({
				...s,
				isSupported: false,
				isConnected: false,
				error: this.getUnsupportedMessage()
			}));
			return false;
		}

		try {
			this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

			midiState.update((s) => ({
				...s,
				isSupported: true,
				isConnected: false, // Not connected until a device is selected
				error: null
			}));

			// Listen for device changes
			this.midiAccess.onstatechange = this.handleStateChange.bind(this);

			// Initial device enumeration
			this.refreshDevices();

			return true;
		} catch (err) {
			midiState.update((s) => ({
				...s,
				isSupported: true,
				isConnected: false,
				error: `MIDI access denied: ${err}`
			}));
			return false;
		}
	}

	private getUnsupportedMessage(): string {
		const ua = navigator.userAgent;
		if (ua.includes('Firefox')) {
			return 'Firefox requires Web MIDI to be enabled. Go to about:config and set dom.webmidi.enabled to true.';
		}
		if (ua.includes('Safari') && !ua.includes('Chrome')) {
			return 'Safari does not support Web MIDI. Please use Chrome or Edge.';
		}
		return 'Web MIDI is not supported in this browser. Please use Chrome or Edge.';
	}

	private refreshDevices(): void {
		if (!this.midiAccess) return;

		const devices: MidiDevice[] = [];

		this.midiAccess.inputs.forEach((input) => {
			devices.push({
				id: input.id,
				name: input.name || 'Unknown Device',
				manufacturer: input.manufacturer || 'Unknown',
				type: 'input',
				state: input.state as 'connected' | 'disconnected'
			});
		});

		this.midiAccess.outputs.forEach((output) => {
			devices.push({
				id: output.id,
				name: output.name || 'Unknown Device',
				manufacturer: output.manufacturer || 'Unknown',
				type: 'output',
				state: output.state as 'connected' | 'disconnected'
			});
		});

		midiState.update((s) => ({ ...s, devices }));
	}

	private handleStateChange(event: MIDIConnectionEvent): void {
		console.log('MIDI device change:', event.port?.name, event.port?.state);
		this.refreshDevices();

		// Handle disconnection of active device
		if (this.activeInput?.id === event.port?.id && event.port?.state === 'disconnected') {
			this.disconnect();
		}
	}

	selectInput(deviceId: string): boolean {
		if (!this.midiAccess) return false;

		// Disconnect current
		if (this.activeInput) {
			this.activeInput.onmidimessage = null;
		}

		const input = this.midiAccess.inputs.get(deviceId);
		if (!input) {
			console.error('Input device not found:', deviceId);
			return false;
		}

		this.activeInput = input;
		this.activeInput.onmidimessage = this.handleMidiMessage.bind(this);

		midiState.update((s) => ({ ...s, activeInputId: deviceId, isConnected: true }));
		console.log('Connected to MIDI device:', input.name);

		return true;
	}

	disconnect(): void {
		if (this.activeInput) {
			this.activeInput.onmidimessage = null;
			this.activeInput = null;
		}
		midiState.update((s) => ({ ...s, activeInputId: null, lastNote: null, isConnected: false }));
	}

	private handleMidiMessage(event: MIDIMessageEvent): void {
		if (!event.data || event.data.length < 3) return;

		const [status, note, velocity] = event.data;
		const channel = (status & 0x0f) + 1;
		const command = status & 0xf0;

		const midiNote: MidiNote = {
			note,
			velocity,
			channel,
			timestamp: event.timeStamp
		};

		// Note On with velocity > 0
		if (command === 0x90 && velocity > 0) {
			midiState.update((s) => ({ ...s, lastNote: midiNote }));
			this.noteHandlers.forEach((handler) => handler(midiNote));
		}
		// Note Off (or Note On with velocity 0)
		else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
			this.noteOffHandlers.forEach((handler) => handler(midiNote));
		}
	}

	onNoteOn(handler: (note: MidiNote) => void): () => void {
		this.noteHandlers.add(handler);
		return () => this.noteHandlers.delete(handler);
	}

	onNoteOff(handler: (note: MidiNote) => void): () => void {
		this.noteOffHandlers.add(handler);
		return () => this.noteOffHandlers.delete(handler);
	}

	getDevices(): MidiDevice[] {
		const devices: MidiDevice[] = [];
		midiState.subscribe((s) => devices.push(...s.devices))();
		return devices;
	}
}

// Singleton export
export const midiService = new MidiService();
