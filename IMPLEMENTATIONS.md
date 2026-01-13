# PDF Reader/Narrator - Implementation Plan for Claude Code

## Project Overview

Build a client-side PDF reader with text-to-speech narration capabilities using the Web Speech API. The application will be built with SvelteKit, TypeScript, and shadcn-svelte, optimized for deployment on a NixOS homelab.

### Key Design Decisions
- **TTS Engine**: Web Speech API (free, browser-native)
- **PDF Engine**: pdfjs-dist (Mozilla's PDF.js)
- **UI Framework**: SvelteKit with shadcn-svelte
- **Deployment**: Self-hosted on NixOS (Node.js adapter)
- **Architecture**: Maximize client-side processing, minimal server routes

---

## Tech Stack

| Category | Technology | Version/Notes |
|----------|------------|---------------|
| Framework | SvelteKit | Latest (Svelte 5) |
| Language | TypeScript | Strict mode |
| UI Components | shadcn-svelte | @next (Svelte 5 compatible) |
| Styling | Tailwind CSS | v4 |
| PDF Rendering | pdfjs-dist | Latest |
| TTS | Web Speech API | Browser native |
| State Management | Svelte stores | Built-in |
| Storage | IndexedDB (idb) | For caching |
| Icons | Lucide Svelte | Included with shadcn |

---

## Project Structure

```
pdf-narrator/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn-svelte components
│   │   │   ├── pdf/
│   │   │   │   ├── PdfViewer.svelte         # Main PDF canvas renderer
│   │   │   │   ├── PdfPage.svelte           # Single page component
│   │   │   │   ├── PdfTextLayer.svelte      # Text overlay for highlighting
│   │   │   │   ├── PdfThumbnail.svelte      # Page thumbnail
│   │   │   │   └── PdfOutline.svelte        # Table of contents/chapters
│   │   │   ├── audio/
│   │   │   │   ├── AudioController.svelte   # Main playback controls
│   │   │   │   ├── VoiceSelector.svelte     # Voice picker dropdown
│   │   │   │   ├── SpeedControl.svelte      # Playback rate slider
│   │   │   │   ├── ProgressBar.svelte       # Reading progress
│   │   │   │   └── FloatingToolbar.svelte   # Main floating UI
│   │   │   ├── layout/
│   │   │   │   ├── Header.svelte            # App header
│   │   │   │   ├── Sidebar.svelte           # Optional sidebar for bookmarks
│   │   │   │   └── MobileNav.svelte         # Mobile navigation
│   │   │   └── shared/
│   │   │       ├── FileUploader.svelte      # Drag & drop PDF upload
│   │   │       ├── UrlInput.svelte          # Load PDF from URL
│   │   │       ├── ThemeToggle.svelte       # Dark/light mode
│   │   │       └── KeyboardShortcuts.svelte # Keyboard handler
│   │   ├── stores/
│   │   │   ├── pdf.ts                 # PDF document state
│   │   │   ├── audio.ts               # TTS/audio state
│   │   │   ├── settings.ts            # User preferences
│   │   │   ├── bookmarks.ts           # Saved positions
│   │   │   └── ui.ts                  # UI state (toolbar, sidebar)
│   │   ├── services/
│   │   │   ├── pdf/
│   │   │   │   ├── loader.ts          # PDF loading & parsing
│   │   │   │   ├── textExtractor.ts   # Text extraction with positions
│   │   │   │   ├── renderer.ts        # Canvas rendering
│   │   │   │   └── types.ts           # PDF-related types
│   │   │   ├── tts/
│   │   │   │   ├── webSpeechApi.ts    # Web Speech API wrapper
│   │   │   │   ├── speechQueue.ts     # Sentence queuing system
│   │   │   │   ├── textProcessor.ts   # Text chunking/cleaning
│   │   │   │   └── types.ts           # TTS-related types
│   │   │   └── storage/
│   │   │       ├── indexedDb.ts       # IndexedDB wrapper
│   │   │       ├── localStorage.ts    # Settings persistence
│   │   │       └── types.ts           # Storage types
│   │   ├── utils/
│   │   │   ├── cn.ts                  # Class name utility (shadcn)
│   │   │   ├── debounce.ts            # Debounce helper
│   │   │   ├── keyboard.ts            # Keyboard shortcut definitions
│   │   │   └── format.ts              # Text/time formatting
│   │   └── types/
│   │       └── index.ts               # Global type definitions
│   ├── routes/
│   │   ├── +layout.svelte             # Root layout with theme
│   │   ├── +layout.ts                 # Layout load function
│   │   ├── +page.svelte               # Main app page
│   │   ├── +page.ts                   # Page load function
│   │   └── api/
│   │       └── proxy/
│   │           └── +server.ts         # Future: API proxy for external TTS
│   ├── app.css                        # Global styles + Tailwind
│   ├── app.html                       # HTML template
│   └── hooks.server.ts                # Server hooks
├── static/
│   ├── pdfjs/                         # PDF.js worker files
│   │   └── pdf.worker.min.mjs
│   └── fonts/                         # Custom fonts (optional)
├── tests/
│   ├── unit/
│   └── e2e/
├── svelte.config.js
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
├── package.json
├── components.json                    # shadcn-svelte config
└── flake.nix                          # NixOS deployment config
```

---

## Implementation Phases

### Phase 1: Project Setup & Core Infrastructure

#### 1.1 Initialize SvelteKit Project

```bash
# Create new SvelteKit project
pnpm create svelte@latest pdf-narrator
# Select: Skeleton project, TypeScript, ESLint, Prettier

cd pdf-narrator

# Add Tailwind CSS
pnpm dlx sv add tailwindcss

# Initialize shadcn-svelte
pnpm dlx shadcn-svelte@next init

# When prompted:
# - Style: default
# - Base color: slate
# - CSS file: src/app.css
# - Components alias: $lib/components
# - Utils alias: $lib/utils
```

#### 1.2 Install Dependencies

```bash
# Core dependencies
pnpm add pdfjs-dist idb

# Dev dependencies
pnpm add -D @types/node

# Add shadcn components
pnpm dlx shadcn-svelte@next add button
pnpm dlx shadcn-svelte@next add slider
pnpm dlx shadcn-svelte@next add select
pnpm dlx shadcn-svelte@next add dropdown-menu
pnpm dlx shadcn-svelte@next add dialog
pnpm dlx shadcn-svelte@next add tooltip
pnpm dlx shadcn-svelte@next add progress
pnpm dlx shadcn-svelte@next add separator
pnpm dlx shadcn-svelte@next add scroll-area
pnpm dlx shadcn-svelte@next add toggle
pnpm dlx shadcn-svelte@next add toggle-group
pnpm dlx shadcn-svelte@next add card
pnpm dlx shadcn-svelte@next add input
pnpm dlx shadcn-svelte@next add label
pnpm dlx shadcn-svelte@next add sonner
pnpm dlx shadcn-svelte@next add skeleton
pnpm dlx shadcn-svelte@next add badge
pnpm dlx shadcn-svelte@next add sheet
pnpm dlx shadcn-svelte@next add popover
```

#### 1.3 Configure PDF.js Worker

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist']
        }
      }
    }
  }
});
```

Copy PDF.js worker to static folder:
```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs static/pdfjs/
```

---

### Phase 2: PDF Service Layer

#### 2.1 PDF Types (`src/lib/services/pdf/types.ts`)

```typescript
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface PdfDocument {
  id: string;
  name: string;
  document: PDFDocumentProxy;
  numPages: number;
  metadata: PdfMetadata;
  outline: PdfOutlineItem[];
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface PdfOutlineItem {
  title: string;
  pageNumber: number;
  children: PdfOutlineItem[];
}

export interface PdfPage {
  pageNumber: number;
  page: PDFPageProxy;
  viewport: any;
  textContent: PdfTextContent;
}

export interface PdfTextContent {
  pageNumber: number;
  items: PdfTextItem[];
  fullText: string;
  sentences: PdfSentence[];
  paragraphs: PdfParagraph[];
}

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
  transform: number[];
}

export interface PdfSentence {
  id: string;
  text: string;
  pageNumber: number;
  startIndex: number;
  endIndex: number;
  items: PdfTextItem[]; // For highlighting
}

export interface PdfParagraph {
  id: string;
  sentences: PdfSentence[];
  pageNumber: number;
}

export interface RenderOptions {
  scale: number;
  rotation: number;
}
```

#### 2.2 PDF Loader (`src/lib/services/pdf/loader.ts`)

```typescript
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocument, PdfMetadata, PdfOutlineItem } from './types';

// Configure worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
}

export async function loadPdfFromFile(file: File): Promise<PdfDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const document = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  return createPdfDocument(file.name, document);
}

export async function loadPdfFromUrl(url: string): Promise<PdfDocument> {
  const document = await pdfjsLib.getDocument(url).promise;
  const name = url.split('/').pop() || 'document.pdf';
  
  return createPdfDocument(name, document);
}

export async function loadPdfFromArrayBuffer(
  buffer: ArrayBuffer, 
  name: string
): Promise<PdfDocument> {
  const document = await pdfjsLib.getDocument({ data: buffer }).promise;
  
  return createPdfDocument(name, document);
}

async function createPdfDocument(
  name: string, 
  document: PDFDocumentProxy
): Promise<PdfDocument> {
  const metadata = await extractMetadata(document);
  const outline = await extractOutline(document);
  
  return {
    id: crypto.randomUUID(),
    name,
    document,
    numPages: document.numPages,
    metadata,
    outline
  };
}

async function extractMetadata(document: PDFDocumentProxy): Promise<PdfMetadata> {
  try {
    const metadata = await document.getMetadata();
    const info = metadata.info as Record<string, any>;
    
    return {
      title: info?.Title,
      author: info?.Author,
      subject: info?.Subject,
      creationDate: info?.CreationDate ? parseDate(info.CreationDate) : undefined,
      modificationDate: info?.ModDate ? parseDate(info.ModDate) : undefined
    };
  } catch {
    return {};
  }
}

async function extractOutline(document: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  try {
    const outline = await document.getOutline();
    if (!outline) return [];
    
    return parseOutlineItems(outline, document);
  } catch {
    return [];
  }
}

async function parseOutlineItems(
  items: any[], 
  document: PDFDocumentProxy
): Promise<PdfOutlineItem[]> {
  const result: PdfOutlineItem[] = [];
  
  for (const item of items) {
    let pageNumber = 1;
    
    if (item.dest) {
      try {
        const dest = typeof item.dest === 'string' 
          ? await document.getDestination(item.dest)
          : item.dest;
        
        if (dest) {
          const pageRef = dest[0];
          const pageIndex = await document.getPageIndex(pageRef);
          pageNumber = pageIndex + 1;
        }
      } catch {
        // Keep default page number
      }
    }
    
    result.push({
      title: item.title,
      pageNumber,
      children: item.items ? await parseOutlineItems(item.items, document) : []
    });
  }
  
  return result;
}

function parseDate(dateString: string): Date | undefined {
  try {
    // PDF date format: D:YYYYMMDDHHmmSS
    const match = dateString.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
    if (match) {
      const [, year, month, day, hour = '0', min = '0', sec = '0'] = match;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(min),
        parseInt(sec)
      );
    }
  } catch {
    // Return undefined on parse failure
  }
  return undefined;
}
```

#### 2.3 Text Extractor (`src/lib/services/pdf/textExtractor.ts`)

```typescript
import type { PDFPageProxy, TextItem } from 'pdfjs-dist';
import type { PdfTextContent, PdfTextItem, PdfSentence, PdfParagraph } from './types';

export async function extractTextFromPage(
  page: PDFPageProxy, 
  pageNumber: number
): Promise<PdfTextContent> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  
  const items: PdfTextItem[] = textContent.items
    .filter((item): item is TextItem => 'str' in item && item.str.trim().length > 0)
    .map(item => {
      const tx = item.transform;
      return {
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5], // Flip Y coordinate
        width: item.width || 0,
        height: item.height || Math.abs(tx[0]),
        fontName: item.fontName || '',
        fontSize: Math.abs(tx[0]),
        transform: tx
      };
    });
  
  const fullText = reconstructText(items);
  const sentences = extractSentences(fullText, items, pageNumber);
  const paragraphs = groupIntoParagraphs(sentences, pageNumber);
  
  return {
    pageNumber,
    items,
    fullText,
    sentences,
    paragraphs
  };
}

function reconstructText(items: PdfTextItem[]): string {
  if (items.length === 0) return '';
  
  // Sort items by Y position (top to bottom), then X (left to right)
  const sortedItems = [...items].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 5) return yDiff; // Different lines
    return a.x - b.x; // Same line, sort by X
  });
  
  let text = '';
  let lastY = sortedItems[0]?.y || 0;
  let lastEndX = 0;
  
  for (const item of sortedItems) {
    const yDiff = Math.abs(item.y - lastY);
    
    if (yDiff > 15) {
      // New line
      text += '\n';
      lastEndX = 0;
    } else if (item.x - lastEndX > 10) {
      // Gap between words
      text += ' ';
    }
    
    text += item.text;
    lastY = item.y;
    lastEndX = item.x + item.width;
  }
  
  return cleanText(text);
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/- \n/g, '')           // Join hyphenated words
    .replace(/\n+/g, '\n')          // Normalize line breaks
    .trim();
}

function extractSentences(
  fullText: string, 
  items: PdfTextItem[], 
  pageNumber: number
): PdfSentence[] {
  // Split text into sentences using regex
  const sentenceRegex = /[^.!?]*[.!?]+\s*/g;
  const sentences: PdfSentence[] = [];
  
  let match: RegExpExecArray | null;
  let index = 0;
  
  while ((match = sentenceRegex.exec(fullText)) !== null) {
    const text = match[0].trim();
    if (text.length < 3) continue; // Skip very short matches
    
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;
    
    // Find corresponding text items for highlighting
    const sentenceItems = findItemsForRange(items, startIndex, endIndex, fullText);
    
    sentences.push({
      id: `${pageNumber}-${index}`,
      text,
      pageNumber,
      startIndex,
      endIndex,
      items: sentenceItems
    });
    
    index++;
  }
  
  // Handle remaining text without sentence-ending punctuation
  const lastEndIndex = sentences.length > 0 
    ? sentences[sentences.length - 1].endIndex 
    : 0;
  
  if (lastEndIndex < fullText.length) {
    const remainingText = fullText.slice(lastEndIndex).trim();
    if (remainingText.length > 0) {
      sentences.push({
        id: `${pageNumber}-${index}`,
        text: remainingText,
        pageNumber,
        startIndex: lastEndIndex,
        endIndex: fullText.length,
        items: findItemsForRange(items, lastEndIndex, fullText.length, fullText)
      });
    }
  }
  
  return sentences;
}

function findItemsForRange(
  items: PdfTextItem[], 
  startIndex: number, 
  endIndex: number,
  fullText: string
): PdfTextItem[] {
  // This is a simplified mapping - in production, you'd want more precise mapping
  const targetText = fullText.slice(startIndex, endIndex);
  const matchingItems: PdfTextItem[] = [];
  
  let currentIndex = 0;
  for (const item of items) {
    const itemEndIndex = currentIndex + item.text.length;
    
    if (currentIndex < endIndex && itemEndIndex > startIndex) {
      matchingItems.push(item);
    }
    
    currentIndex = itemEndIndex + 1; // +1 for space
  }
  
  return matchingItems;
}

function groupIntoParagraphs(
  sentences: PdfSentence[], 
  pageNumber: number
): PdfParagraph[] {
  const paragraphs: PdfParagraph[] = [];
  let currentParagraph: PdfSentence[] = [];
  
  for (let i = 0; i < sentences.length; i++) {
    currentParagraph.push(sentences[i]);
    
    // Check if this looks like end of paragraph
    const text = sentences[i].text;
    const isEndOfParagraph = 
      text.endsWith('\n\n') || 
      (i < sentences.length - 1 && 
       sentences[i + 1].startIndex - sentences[i].endIndex > 50);
    
    if (isEndOfParagraph || i === sentences.length - 1) {
      paragraphs.push({
        id: `para-${pageNumber}-${paragraphs.length}`,
        sentences: currentParagraph,
        pageNumber
      });
      currentParagraph = [];
    }
  }
  
  return paragraphs;
}

export async function extractAllText(
  document: any, 
  progressCallback?: (page: number, total: number) => void
): Promise<Map<number, PdfTextContent>> {
  const textMap = new Map<number, PdfTextContent>();
  
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i);
    const textContent = await extractTextFromPage(page, i);
    textMap.set(i, textContent);
    
    progressCallback?.(i, document.numPages);
  }
  
  return textMap;
}
```

#### 2.4 PDF Renderer (`src/lib/services/pdf/renderer.ts`)

```typescript
import type { PDFPageProxy } from 'pdfjs-dist';
import type { RenderOptions } from './types';

export interface RenderResult {
  canvas: HTMLCanvasElement;
  viewport: any;
}

export async function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  options: RenderOptions = { scale: 1.5, rotation: 0 }
): Promise<RenderResult> {
  const { scale, rotation } = options;
  
  const viewport = page.getViewport({ scale, rotation });
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Failed to get canvas 2D context');
  }
  
  // Set canvas dimensions
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  // Render PDF page
  const renderContext = {
    canvasContext: context,
    viewport
  };
  
  await page.render(renderContext).promise;
  
  return { canvas, viewport };
}

export function calculateFitScale(
  page: PDFPageProxy,
  containerWidth: number,
  containerHeight: number,
  padding: number = 40
): number {
  const viewport = page.getViewport({ scale: 1 });
  
  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;
  
  const scaleX = availableWidth / viewport.width;
  const scaleY = availableHeight / viewport.height;
  
  return Math.min(scaleX, scaleY, 2); // Cap at 2x
}

export function calculateFitWidthScale(
  page: PDFPageProxy,
  containerWidth: number,
  padding: number = 40
): number {
  const viewport = page.getViewport({ scale: 1 });
  const availableWidth = containerWidth - padding * 2;
  
  return Math.min(availableWidth / viewport.width, 2);
}
```

---

### Phase 3: TTS Service Layer

#### 3.1 TTS Types (`src/lib/services/tts/types.ts`)

```typescript
export interface Voice {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
  voiceURI: string;
}

export interface SpeechSettings {
  voice: Voice | null;
  rate: number;      // 0.1 to 10, default 1
  pitch: number;     // 0 to 2, default 1
  volume: number;    // 0 to 1, default 1
}

export interface SpeechState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentSentenceId: string | null;
  currentPageNumber: number;
  error: string | null;
}

export interface SpeechQueueItem {
  id: string;
  text: string;
  pageNumber: number;
  sentenceIndex: number;
}

export type SpeechEvent = 
  | { type: 'start'; sentenceId: string }
  | { type: 'end'; sentenceId: string }
  | { type: 'boundary'; charIndex: number; charLength: number }
  | { type: 'error'; error: string }
  | { type: 'pause' }
  | { type: 'resume' };
```

#### 3.2 Web Speech API Wrapper (`src/lib/services/tts/webSpeechApi.ts`)

```typescript
import type { Voice, SpeechSettings, SpeechEvent } from './types';

export class WebSpeechService {
  private synth: SpeechSynthesis;
  private voices: Voice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private eventListeners: Map<string, Set<(event: SpeechEvent) => void>> = new Map();
  private isInitialized = false;
  
  constructor() {
    if (typeof window === 'undefined') {
      throw new Error('WebSpeechService requires browser environment');
    }
    
    this.synth = window.speechSynthesis;
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    return new Promise((resolve) => {
      const loadVoices = () => {
        const synthVoices = this.synth.getVoices();
        
        this.voices = synthVoices.map(voice => ({
          id: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
          localService: voice.localService,
          default: voice.default,
          voiceURI: voice.voiceURI
        }));
        
        if (this.voices.length > 0) {
          this.isInitialized = true;
          resolve();
        }
      };
      
      // Try immediately
      loadVoices();
      
      // Also listen for voiceschanged event (Chrome loads voices async)
      if (!this.isInitialized) {
        this.synth.addEventListener('voiceschanged', loadVoices, { once: true });
        
        // Fallback timeout
        setTimeout(() => {
          loadVoices();
          resolve();
        }, 1000);
      }
    });
  }
  
  getVoices(): Voice[] {
    return this.voices;
  }
  
  getVoicesByLanguage(langCode: string): Voice[] {
    return this.voices.filter(v => v.lang.startsWith(langCode));
  }
  
  getDefaultVoice(): Voice | null {
    return this.voices.find(v => v.default) || this.voices[0] || null;
  }
  
  speak(
    text: string, 
    settings: SpeechSettings,
    sentenceId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      this.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Apply settings
      if (settings.voice) {
        const synthVoice = this.synth.getVoices()
          .find(v => v.voiceURI === settings.voice!.voiceURI);
        if (synthVoice) {
          utterance.voice = synthVoice;
        }
      }
      
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;
      
      // Event handlers
      utterance.onstart = () => {
        this.emit({ type: 'start', sentenceId });
      };
      
      utterance.onend = () => {
        this.currentUtterance = null;
        this.emit({ type: 'end', sentenceId });
        resolve();
      };
      
      utterance.onerror = (event) => {
        this.currentUtterance = null;
        const error = event.error || 'Speech synthesis error';
        this.emit({ type: 'error', error });
        reject(new Error(error));
      };
      
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          this.emit({
            type: 'boundary',
            charIndex: event.charIndex,
            charLength: event.charLength || 0
          });
        }
      };
      
      utterance.onpause = () => {
        this.emit({ type: 'pause' });
      };
      
      utterance.onresume = () => {
        this.emit({ type: 'resume' });
      };
      
      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    });
  }
  
  pause(): void {
    if (this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
    }
  }
  
  resume(): void {
    if (this.synth.paused) {
      this.synth.resume();
    }
  }
  
  cancel(): void {
    this.synth.cancel();
    this.currentUtterance = null;
  }
  
  get isSpeaking(): boolean {
    return this.synth.speaking;
  }
  
  get isPaused(): boolean {
    return this.synth.paused;
  }
  
  // Event system
  on(event: string, callback: (event: SpeechEvent) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }
  
  private emit(event: SpeechEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
    
    // Also emit to 'all' listeners
    const allListeners = this.eventListeners.get('all');
    if (allListeners) {
      allListeners.forEach(callback => callback(event));
    }
  }
  
  // Check browser support
  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
}

// Singleton instance
let instance: WebSpeechService | null = null;

export function getWebSpeechService(): WebSpeechService {
  if (!instance) {
    instance = new WebSpeechService();
  }
  return instance;
}
```

#### 3.3 Speech Queue (`src/lib/services/tts/speechQueue.ts`)

```typescript
import { getWebSpeechService } from './webSpeechApi';
import type { SpeechSettings, SpeechQueueItem, SpeechEvent } from './types';
import type { PdfSentence } from '../pdf/types';

export class SpeechQueue {
  private queue: SpeechQueueItem[] = [];
  private currentIndex = -1;
  private isRunning = false;
  private speechService = getWebSpeechService();
  private settings: SpeechSettings;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();
  
  constructor(settings: SpeechSettings) {
    this.settings = settings;
    
    // Listen for speech events
    this.speechService.on('end', () => {
      if (this.isRunning) {
        this.playNext();
      }
    });
    
    this.speechService.on('error', (event) => {
      this.emit('error', event);
    });
    
    this.speechService.on('boundary', (event) => {
      this.emit('boundary', {
        ...event,
        sentenceId: this.getCurrentItem()?.id
      });
    });
  }
  
  loadSentences(sentences: PdfSentence[]): void {
    this.queue = sentences.map((sentence, index) => ({
      id: sentence.id,
      text: sentence.text,
      pageNumber: sentence.pageNumber,
      sentenceIndex: index
    }));
    this.currentIndex = -1;
  }
  
  appendSentences(sentences: PdfSentence[]): void {
    const newItems = sentences.map((sentence, index) => ({
      id: sentence.id,
      text: sentence.text,
      pageNumber: sentence.pageNumber,
      sentenceIndex: this.queue.length + index
    }));
    this.queue.push(...newItems);
  }
  
  async play(): Promise<void> {
    if (this.speechService.isPaused) {
      this.speechService.resume();
      this.isRunning = true;
      this.emit('resume', null);
      return;
    }
    
    if (this.isRunning) return;
    
    this.isRunning = true;
    await this.speechService.initialize();
    
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
    }
    
    await this.playNext();
  }
  
  private async playNext(): Promise<void> {
    if (!this.isRunning) return;
    
    if (this.currentIndex >= this.queue.length) {
      this.isRunning = false;
      this.emit('complete', null);
      return;
    }
    
    const item = this.queue[this.currentIndex];
    this.emit('sentenceStart', item);
    
    try {
      await this.speechService.speak(item.text, this.settings, item.id);
      this.currentIndex++;
    } catch (error) {
      console.error('Speech error:', error);
    }
  }
  
  pause(): void {
    this.speechService.pause();
    this.isRunning = false;
    this.emit('pause', null);
  }
  
  stop(): void {
    this.speechService.cancel();
    this.isRunning = false;
    this.currentIndex = -1;
    this.emit('stop', null);
  }
  
  skipForward(): void {
    if (this.currentIndex < this.queue.length - 1) {
      this.speechService.cancel();
      this.currentIndex++;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }
  
  skipBackward(): void {
    if (this.currentIndex > 0) {
      this.speechService.cancel();
      this.currentIndex--;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }
  
  jumpToSentence(sentenceId: string): void {
    const index = this.queue.findIndex(item => item.id === sentenceId);
    if (index >= 0) {
      this.speechService.cancel();
      this.currentIndex = index;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }
  
  jumpToPage(pageNumber: number): void {
    const index = this.queue.findIndex(item => item.pageNumber === pageNumber);
    if (index >= 0) {
      this.speechService.cancel();
      this.currentIndex = index;
      if (this.isRunning) {
        this.playNext();
      }
    }
  }
  
  updateSettings(settings: Partial<SpeechSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }
  
  getCurrentItem(): SpeechQueueItem | null {
    return this.queue[this.currentIndex] || null;
  }
  
  getProgress(): { current: number; total: number; percentage: number } {
    const current = Math.max(0, this.currentIndex);
    const total = this.queue.length;
    const percentage = total > 0 ? (current / total) * 100 : 0;
    
    return { current, total, percentage };
  }
  
  get isPlaying(): boolean {
    return this.isRunning && !this.speechService.isPaused;
  }
  
  get isPaused(): boolean {
    return this.speechService.isPaused;
  }
  
  // Event system
  on(event: string, callback: (data: any) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(callback);
    
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }
  
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
}
```

#### 3.4 Text Processor (`src/lib/services/tts/textProcessor.ts`)

```typescript
/**
 * Processes and cleans text for optimal TTS output
 */

export function cleanTextForSpeech(text: string): string {
  return text
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    // Remove reference markers like [1], [2,3]
    .replace(/\[\d+(?:,\s*\d+)*\]/g, '')
    // Remove footnote markers
    .replace(/[*†‡§]/g, '')
    // Expand common abbreviations
    .replace(/\betc\./gi, 'etcetera')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    .replace(/\bvs\./gi, 'versus')
    .replace(/\bDr\./gi, 'Doctor')
    .replace(/\bMr\./gi, 'Mister')
    .replace(/\bMrs\./gi, 'Missus')
    .replace(/\bMs\./gi, 'Miss')
    .replace(/\bProf\./gi, 'Professor')
    // Handle numbers with units
    .replace(/(\d+)%/g, '$1 percent')
    .replace(/(\d+)°/g, '$1 degrees')
    // Handle URLs (read as "link")
    .replace(/https?:\/\/[^\s]+/g, 'link')
    // Handle email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, 'email address')
    // Clean up remaining artifacts
    .replace(/[_~`]/g, '')
    .trim();
}

export function splitIntoChunks(
  text: string, 
  maxLength: number = 200
): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

export function estimateSpeechDuration(
  text: string, 
  wordsPerMinute: number = 150
): number {
  const wordCount = text.split(/\s+/).length;
  return (wordCount / wordsPerMinute) * 60; // Duration in seconds
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

---

### Phase 4: Svelte Stores

#### 4.1 PDF Store (`src/lib/stores/pdf.ts`)

```typescript
import { writable, derived, get } from 'svelte/store';
import type { PdfDocument, PdfTextContent, RenderOptions } from '$lib/services/pdf/types';
import { loadPdfFromFile, loadPdfFromUrl } from '$lib/services/pdf/loader';
import { extractTextFromPage, extractAllText } from '$lib/services/pdf/textExtractor';

interface PdfState {
  document: PdfDocument | null;
  currentPage: number;
  scale: number;
  rotation: number;
  isLoading: boolean;
  loadingProgress: number;
  error: string | null;
  textContent: Map<number, PdfTextContent>;
  isTextExtracting: boolean;
  textExtractionProgress: number;
}

const initialState: PdfState = {
  document: null,
  currentPage: 1,
  scale: 1.5,
  rotation: 0,
  isLoading: false,
  loadingProgress: 0,
  error: null,
  textContent: new Map(),
  isTextExtracting: false,
  textExtractionProgress: 0
};

function createPdfStore() {
  const { subscribe, set, update } = writable<PdfState>(initialState);
  
  return {
    subscribe,
    
    async loadFromFile(file: File) {
      update(state => ({ 
        ...state, 
        isLoading: true, 
        error: null,
        loadingProgress: 0 
      }));
      
      try {
        const document = await loadPdfFromFile(file);
        
        update(state => ({
          ...state,
          document,
          currentPage: 1,
          isLoading: false,
          loadingProgress: 100,
          textContent: new Map()
        }));
        
        // Start text extraction in background
        this.extractAllText();
        
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load PDF'
        }));
      }
    },
    
    async loadFromUrl(url: string) {
      update(state => ({ 
        ...state, 
        isLoading: true, 
        error: null 
      }));
      
      try {
        const document = await loadPdfFromUrl(url);
        
        update(state => ({
          ...state,
          document,
          currentPage: 1,
          isLoading: false,
          textContent: new Map()
        }));
        
        this.extractAllText();
        
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load PDF'
        }));
      }
    },
    
    async extractAllText() {
      const state = get({ subscribe });
      if (!state.document) return;
      
      update(s => ({ ...s, isTextExtracting: true, textExtractionProgress: 0 }));
      
      try {
        const textContent = await extractAllText(
          state.document.document,
          (page, total) => {
            update(s => ({
              ...s,
              textExtractionProgress: Math.round((page / total) * 100)
            }));
          }
        );
        
        update(s => ({
          ...s,
          textContent,
          isTextExtracting: false,
          textExtractionProgress: 100
        }));
        
      } catch (error) {
        update(s => ({
          ...s,
          isTextExtracting: false,
          error: 'Failed to extract text'
        }));
      }
    },
    
    async getPageText(pageNumber: number): Promise<PdfTextContent | null> {
      const state = get({ subscribe });
      
      if (state.textContent.has(pageNumber)) {
        return state.textContent.get(pageNumber)!;
      }
      
      if (!state.document) return null;
      
      try {
        const page = await state.document.document.getPage(pageNumber);
        const textContent = await extractTextFromPage(page, pageNumber);
        
        update(s => {
          const newMap = new Map(s.textContent);
          newMap.set(pageNumber, textContent);
          return { ...s, textContent: newMap };
        });
        
        return textContent;
      } catch {
        return null;
      }
    },
    
    goToPage(pageNumber: number) {
      update(state => {
        if (!state.document) return state;
        
        const page = Math.max(1, Math.min(pageNumber, state.document.numPages));
        return { ...state, currentPage: page };
      });
    },
    
    nextPage() {
      update(state => {
        if (!state.document) return state;
        if (state.currentPage >= state.document.numPages) return state;
        
        return { ...state, currentPage: state.currentPage + 1 };
      });
    },
    
    previousPage() {
      update(state => {
        if (state.currentPage <= 1) return state;
        
        return { ...state, currentPage: state.currentPage - 1 };
      });
    },
    
    setScale(scale: number) {
      update(state => ({ ...state, scale: Math.max(0.25, Math.min(4, scale)) }));
    },
    
    zoomIn() {
      update(state => ({ ...state, scale: Math.min(4, state.scale + 0.25) }));
    },
    
    zoomOut() {
      update(state => ({ ...state, scale: Math.max(0.25, state.scale - 0.25) }));
    },
    
    rotate() {
      update(state => ({ ...state, rotation: (state.rotation + 90) % 360 }));
    },
    
    reset() {
      set(initialState);
    }
  };
}

export const pdfStore = createPdfStore();

// Derived stores
export const currentDocument = derived(pdfStore, $pdf => $pdf.document);
export const currentPage = derived(pdfStore, $pdf => $pdf.currentPage);
export const totalPages = derived(pdfStore, $pdf => $pdf.document?.numPages || 0);
export const isLoading = derived(pdfStore, $pdf => $pdf.isLoading);
export const renderOptions = derived(pdfStore, $pdf => ({
  scale: $pdf.scale,
  rotation: $pdf.rotation
}));
```

#### 4.2 Audio Store (`src/lib/stores/audio.ts`)

```typescript
import { writable, derived, get } from 'svelte/store';
import { SpeechQueue } from '$lib/services/tts/speechQueue';
import { getWebSpeechService } from '$lib/services/tts/webSpeechApi';
import type { Voice, SpeechSettings } from '$lib/services/tts/types';
import type { PdfSentence } from '$lib/services/pdf/types';

interface AudioState {
  isPlaying: boolean;
  isPaused: boolean;
  isInitialized: boolean;
  voices: Voice[];
  selectedVoice: Voice | null;
  rate: number;
  pitch: number;
  volume: number;
  currentSentenceId: string | null;
  currentPageNumber: number;
  progress: { current: number; total: number; percentage: number };
  error: string | null;
}

const initialState: AudioState = {
  isPlaying: false,
  isPaused: false,
  isInitialized: false,
  voices: [],
  selectedVoice: null,
  rate: 1,
  pitch: 1,
  volume: 1,
  currentSentenceId: null,
  currentPageNumber: 1,
  progress: { current: 0, total: 0, percentage: 0 },
  error: null
};

function createAudioStore() {
  const { subscribe, set, update } = writable<AudioState>(initialState);
  
  let speechQueue: SpeechQueue | null = null;
  let speechService = typeof window !== 'undefined' ? getWebSpeechService() : null;
  
  const getSettings = (): SpeechSettings => {
    const state = get({ subscribe });
    return {
      voice: state.selectedVoice,
      rate: state.rate,
      pitch: state.pitch,
      volume: state.volume
    };
  };
  
  return {
    subscribe,
    
    async initialize() {
      if (!speechService) return;
      
      try {
        await speechService.initialize();
        const voices = speechService.getVoices();
        const defaultVoice = speechService.getDefaultVoice();
        
        update(state => ({
          ...state,
          isInitialized: true,
          voices,
          selectedVoice: defaultVoice
        }));
        
        // Create speech queue with initial settings
        speechQueue = new SpeechQueue(getSettings());
        
        // Set up event listeners
        speechQueue.on('sentenceStart', (item) => {
          update(state => ({
            ...state,
            currentSentenceId: item.id,
            currentPageNumber: item.pageNumber,
            progress: speechQueue!.getProgress()
          }));
        });
        
        speechQueue.on('pause', () => {
          update(state => ({ ...state, isPlaying: false, isPaused: true }));
        });
        
        speechQueue.on('resume', () => {
          update(state => ({ ...state, isPlaying: true, isPaused: false }));
        });
        
        speechQueue.on('complete', () => {
          update(state => ({
            ...state,
            isPlaying: false,
            isPaused: false,
            currentSentenceId: null
          }));
        });
        
        speechQueue.on('stop', () => {
          update(state => ({
            ...state,
            isPlaying: false,
            isPaused: false,
            currentSentenceId: null,
            progress: { current: 0, total: 0, percentage: 0 }
          }));
        });
        
        speechQueue.on('error', (event) => {
          update(state => ({ ...state, error: event.error }));
        });
        
      } catch (error) {
        update(state => ({
          ...state,
          error: 'Failed to initialize speech synthesis'
        }));
      }
    },
    
    loadSentences(sentences: PdfSentence[]) {
      if (!speechQueue) return;
      speechQueue.loadSentences(sentences);
      update(state => ({
        ...state,
        progress: speechQueue!.getProgress()
      }));
    },
    
    appendSentences(sentences: PdfSentence[]) {
      if (!speechQueue) return;
      speechQueue.appendSentences(sentences);
      update(state => ({
        ...state,
        progress: speechQueue!.getProgress()
      }));
    },
    
    async play() {
      if (!speechQueue) return;
      
      update(state => ({ ...state, isPlaying: true, isPaused: false }));
      await speechQueue.play();
    },
    
    pause() {
      if (!speechQueue) return;
      speechQueue.pause();
    },
    
    stop() {
      if (!speechQueue) return;
      speechQueue.stop();
    },
    
    skipForward() {
      if (!speechQueue) return;
      speechQueue.skipForward();
    },
    
    skipBackward() {
      if (!speechQueue) return;
      speechQueue.skipBackward();
    },
    
    jumpToSentence(sentenceId: string) {
      if (!speechQueue) return;
      speechQueue.jumpToSentence(sentenceId);
    },
    
    jumpToPage(pageNumber: number) {
      if (!speechQueue) return;
      speechQueue.jumpToPage(pageNumber);
    },
    
    setVoice(voice: Voice) {
      update(state => ({ ...state, selectedVoice: voice }));
      speechQueue?.updateSettings({ voice });
    },
    
    setRate(rate: number) {
      const clampedRate = Math.max(0.1, Math.min(10, rate));
      update(state => ({ ...state, rate: clampedRate }));
      speechQueue?.updateSettings({ rate: clampedRate });
    },
    
    setPitch(pitch: number) {
      const clampedPitch = Math.max(0, Math.min(2, pitch));
      update(state => ({ ...state, pitch: clampedPitch }));
      speechQueue?.updateSettings({ pitch: clampedPitch });
    },
    
    setVolume(volume: number) {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      update(state => ({ ...state, volume: clampedVolume }));
      speechQueue?.updateSettings({ volume: clampedVolume });
    },
    
    getVoicesByLanguage(langCode: string): Voice[] {
      return speechService?.getVoicesByLanguage(langCode) || [];
    },
    
    reset() {
      speechQueue?.stop();
      set(initialState);
    }
  };
}

export const audioStore = createAudioStore();

// Derived stores
export const isPlaying = derived(audioStore, $audio => $audio.isPlaying);
export const isPaused = derived(audioStore, $audio => $audio.isPaused);
export const currentSentenceId = derived(audioStore, $audio => $audio.currentSentenceId);
export const voices = derived(audioStore, $audio => $audio.voices);
export const selectedVoice = derived(audioStore, $audio => $audio.selectedVoice);
export const playbackProgress = derived(audioStore, $audio => $audio.progress);
```

#### 4.3 Settings Store (`src/lib/stores/settings.ts`)

```typescript
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

interface Settings {
  theme: 'light' | 'dark' | 'system';
  autoPlay: boolean;
  highlightCurrentSentence: boolean;
  highlightColor: string;
  defaultRate: number;
  defaultPitch: number;
  defaultVolume: number;
  preferredVoiceId: string | null;
  showPageThumbnails: boolean;
  rememberPosition: boolean;
  keyboardShortcutsEnabled: boolean;
}

const defaultSettings: Settings = {
  theme: 'system',
  autoPlay: false,
  highlightCurrentSentence: true,
  highlightColor: '#fef08a', // Yellow-200
  defaultRate: 1,
  defaultPitch: 1,
  defaultVolume: 1,
  preferredVoiceId: null,
  showPageThumbnails: true,
  rememberPosition: true,
  keyboardShortcutsEnabled: true
};

const STORAGE_KEY = 'pdf-narrator-settings';

function loadSettings(): Settings {
  if (!browser) return defaultSettings;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  
  return defaultSettings;
}

function saveSettings(settings: Settings): void {
  if (!browser) return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>(loadSettings());
  
  // Subscribe to changes and persist
  subscribe((settings) => {
    saveSettings(settings);
  });
  
  return {
    subscribe,
    
    setTheme(theme: Settings['theme']) {
      update(s => ({ ...s, theme }));
      
      if (browser) {
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          // System preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.classList.toggle('dark', prefersDark);
        }
      }
    },
    
    updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
      update(s => ({ ...s, [key]: value }));
    },
    
    reset() {
      set(defaultSettings);
    }
  };
}

export const settingsStore = createSettingsStore();
```

#### 4.4 Bookmarks Store (`src/lib/stores/bookmarks.ts`)

```typescript
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

interface Bookmark {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  sentenceId: string | null;
  label: string;
  createdAt: Date;
}

interface ReadingPosition {
  documentId: string;
  pageNumber: number;
  sentenceId: string | null;
  timestamp: Date;
}

interface BookmarksState {
  bookmarks: Bookmark[];
  recentPositions: Map<string, ReadingPosition>;
}

const BOOKMARKS_KEY = 'pdf-narrator-bookmarks';
const POSITIONS_KEY = 'pdf-narrator-positions';

function loadBookmarks(): Bookmark[] {
  if (!browser) return [];
  
  try {
    const stored = localStorage.getItem(BOOKMARKS_KEY);
    if (stored) {
      return JSON.parse(stored).map((b: any) => ({
        ...b,
        createdAt: new Date(b.createdAt)
      }));
    }
  } catch {
    // Ignore
  }
  
  return [];
}

function loadPositions(): Map<string, ReadingPosition> {
  if (!browser) return new Map();
  
  try {
    const stored = localStorage.getItem(POSITIONS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(
        Object.entries(parsed).map(([key, value]: [string, any]) => [
          key,
          { ...value, timestamp: new Date(value.timestamp) }
        ])
      );
    }
  } catch {
    // Ignore
  }
  
  return new Map();
}

function saveBookmarks(bookmarks: Bookmark[]): void {
  if (!browser) return;
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

function savePositions(positions: Map<string, ReadingPosition>): void {
  if (!browser) return;
  localStorage.setItem(
    POSITIONS_KEY,
    JSON.stringify(Object.fromEntries(positions))
  );
}

function createBookmarksStore() {
  const { subscribe, set, update } = writable<BookmarksState>({
    bookmarks: loadBookmarks(),
    recentPositions: loadPositions()
  });
  
  return {
    subscribe,
    
    addBookmark(
      documentId: string,
      documentName: string,
      pageNumber: number,
      sentenceId: string | null,
      label?: string
    ) {
      update(state => {
        const bookmark: Bookmark = {
          id: crypto.randomUUID(),
          documentId,
          documentName,
          pageNumber,
          sentenceId,
          label: label || `Page ${pageNumber}`,
          createdAt: new Date()
        };
        
        const newBookmarks = [...state.bookmarks, bookmark];
        saveBookmarks(newBookmarks);
        
        return { ...state, bookmarks: newBookmarks };
      });
    },
    
    removeBookmark(bookmarkId: string) {
      update(state => {
        const newBookmarks = state.bookmarks.filter(b => b.id !== bookmarkId);
        saveBookmarks(newBookmarks);
        
        return { ...state, bookmarks: newBookmarks };
      });
    },
    
    getBookmarksForDocument(documentId: string): Bookmark[] {
      return get({ subscribe }).bookmarks.filter(b => b.documentId === documentId);
    },
    
    updatePosition(
      documentId: string,
      pageNumber: number,
      sentenceId: string | null
    ) {
      update(state => {
        const newPositions = new Map(state.recentPositions);
        newPositions.set(documentId, {
          documentId,
          pageNumber,
          sentenceId,
          timestamp: new Date()
        });
        
        savePositions(newPositions);
        
        return { ...state, recentPositions: newPositions };
      });
    },
    
    getPosition(documentId: string): ReadingPosition | null {
      return get({ subscribe }).recentPositions.get(documentId) || null;
    },
    
    clearPositions() {
      update(state => {
        savePositions(new Map());
        return { ...state, recentPositions: new Map() };
      });
    },
    
    clearBookmarks() {
      update(state => {
        saveBookmarks([]);
        return { ...state, bookmarks: [] };
      });
    }
  };
}

export const bookmarksStore = createBookmarksStore();
```

#### 4.5 UI Store (`src/lib/stores/ui.ts`)

```typescript
import { writable, derived } from 'svelte/store';

interface UiState {
  isToolbarVisible: boolean;
  isToolbarExpanded: boolean;
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isOutlineOpen: boolean;
  isBookmarksOpen: boolean;
  toolbarPosition: { x: number; y: number };
  isMobile: boolean;
  containerWidth: number;
  containerHeight: number;
}

const initialState: UiState = {
  isToolbarVisible: true,
  isToolbarExpanded: false,
  isSidebarOpen: false,
  isSettingsOpen: false,
  isOutlineOpen: false,
  isBookmarksOpen: false,
  toolbarPosition: { x: 0, y: 0 },
  isMobile: false,
  containerWidth: 0,
  containerHeight: 0
};

function createUiStore() {
  const { subscribe, set, update } = writable<UiState>(initialState);
  
  return {
    subscribe,
    
    toggleToolbar() {
      update(s => ({ ...s, isToolbarVisible: !s.isToolbarVisible }));
    },
    
    expandToolbar() {
      update(s => ({ ...s, isToolbarExpanded: true }));
    },
    
    collapseToolbar() {
      update(s => ({ ...s, isToolbarExpanded: false }));
    },
    
    toggleSidebar() {
      update(s => ({ ...s, isSidebarOpen: !s.isSidebarOpen }));
    },
    
    openSettings() {
      update(s => ({ ...s, isSettingsOpen: true }));
    },
    
    closeSettings() {
      update(s => ({ ...s, isSettingsOpen: false }));
    },
    
    toggleOutline() {
      update(s => ({ ...s, isOutlineOpen: !s.isOutlineOpen }));
    },
    
    toggleBookmarks() {
      update(s => ({ ...s, isBookmarksOpen: !s.isBookmarksOpen }));
    },
    
    setToolbarPosition(x: number, y: number) {
      update(s => ({ ...s, toolbarPosition: { x, y } }));
    },
    
    setMobile(isMobile: boolean) {
      update(s => ({ ...s, isMobile }));
    },
    
    setContainerSize(width: number, height: number) {
      update(s => ({
        ...s,
        containerWidth: width,
        containerHeight: height,
        isMobile: width < 768
      }));
    },
    
    closeAllModals() {
      update(s => ({
        ...s,
        isSettingsOpen: false,
        isOutlineOpen: false,
        isBookmarksOpen: false
      }));
    }
  };
}

export const uiStore = createUiStore();

export const isMobile = derived(uiStore, $ui => $ui.isMobile);
export const isToolbarVisible = derived(uiStore, $ui => $ui.isToolbarVisible);
```

---

### Phase 5: UI Components

#### 5.1 Main Layout (`src/routes/+layout.svelte`)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { Toaster } from '$lib/components/ui/sonner';
  import { settingsStore } from '$lib/stores/settings';
  import '../app.css';
  
  let { children } = $props();
  
  onMount(() => {
    // Apply initial theme
    const theme = $settingsStore.theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    }
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if ($settingsStore.theme === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  });
</script>

<div class="min-h-screen bg-background text-foreground">
  {@render children()}
</div>

<Toaster richColors position="bottom-right" />
```

#### 5.2 Main Page (`src/routes/+page.svelte`)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { pdfStore, currentDocument, currentPage, totalPages, isLoading } from '$lib/stores/pdf';
  import { audioStore } from '$lib/stores/audio';
  import { uiStore, isMobile } from '$lib/stores/ui';
  import { settingsStore } from '$lib/stores/settings';
  import { bookmarksStore } from '$lib/stores/bookmarks';
  
  import FileUploader from '$lib/components/shared/FileUploader.svelte';
  import PdfViewer from '$lib/components/pdf/PdfViewer.svelte';
  import FloatingToolbar from '$lib/components/audio/FloatingToolbar.svelte';
  import KeyboardShortcuts from '$lib/components/shared/KeyboardShortcuts.svelte';
  import SettingsDialog from '$lib/components/shared/SettingsDialog.svelte';
  import OutlineSheet from '$lib/components/pdf/OutlineSheet.svelte';
  import BookmarksSheet from '$lib/components/pdf/BookmarksSheet.svelte';
  
  let containerRef: HTMLDivElement;
  
  onMount(async () => {
    // Initialize audio
    await audioStore.initialize();
    
    // Set up resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        uiStore.setContainerSize(
          entry.contentRect.width,
          entry.contentRect.height
        );
      }
    });
    
    if (containerRef) {
      resizeObserver.observe(containerRef);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  });
  
  // Load sentences when text is extracted
  $effect(() => {
    const textContent = $pdfStore.textContent;
    if (textContent.size > 0) {
      // Collect all sentences from all pages
      const allSentences = Array.from(textContent.values())
        .flatMap(tc => tc.sentences);
      
      audioStore.loadSentences(allSentences);
    }
  });
  
  // Update reading position
  $effect(() => {
    if ($currentDocument && $audioStore.currentPageNumber) {
      bookmarksStore.updatePosition(
        $currentDocument.id,
        $audioStore.currentPageNumber,
        $audioStore.currentSentenceId
      );
    }
  });
  
  function handleFileSelected(file: File) {
    pdfStore.loadFromFile(file);
  }
</script>

<svelte:head>
  <title>
    {$currentDocument?.name || 'PDF Narrator'} | PDF Reader with Text-to-Speech
  </title>
</svelte:head>

<KeyboardShortcuts />

<div 
  bind:this={containerRef}
  class="relative h-screen w-full overflow-hidden bg-muted/30"
>
  {#if !$currentDocument}
    <!-- Upload screen -->
    <div class="flex h-full items-center justify-center p-4">
      <FileUploader onFileSelected={handleFileSelected} />
    </div>
  {:else}
    <!-- PDF Viewer -->
    <PdfViewer />
    
    <!-- Floating Toolbar -->
    <FloatingToolbar />
  {/if}
  
  {#if $isLoading}
    <!-- Loading overlay -->
    <div class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-4">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p class="text-sm text-muted-foreground">Loading PDF...</p>
      </div>
    </div>
  {/if}
</div>

<!-- Modals and Sheets -->
<SettingsDialog />
<OutlineSheet />
<BookmarksSheet />
```

#### 5.3 PDF Viewer Component (`src/lib/components/pdf/PdfViewer.svelte`)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { 
    pdfStore, 
    currentDocument, 
    currentPage, 
    totalPages, 
    renderOptions 
  } from '$lib/stores/pdf';
  import { audioStore, currentSentenceId } from '$lib/stores/audio';
  import { settingsStore } from '$lib/stores/settings';
  import { renderPage, calculateFitScale } from '$lib/services/pdf/renderer';
  import type { PdfTextItem } from '$lib/services/pdf/types';
  
  import { Button } from '$lib/components/ui/button';
  import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-svelte';
  
  let canvasRef: HTMLCanvasElement;
  let containerRef: HTMLDivElement;
  let textLayerRef: HTMLDivElement;
  let currentPageData: any = null;
  
  // Render current page
  async function renderCurrentPage() {
    if (!$currentDocument || !canvasRef) return;
    
    try {
      const page = await $currentDocument.document.getPage($currentPage);
      currentPageData = page;
      
      await renderPage(page, canvasRef, $renderOptions);
      
      // Update text layer for highlighting
      updateTextLayer();
      
    } catch (error) {
      console.error('Failed to render page:', error);
    }
  }
  
  function updateTextLayer() {
    if (!textLayerRef) return;
    
    const textContent = $pdfStore.textContent.get($currentPage);
    if (!textContent) return;
    
    // Clear existing highlights
    textLayerRef.innerHTML = '';
    
    // Create highlight elements for each text item
    const viewport = currentPageData?.getViewport($renderOptions);
    if (!viewport) return;
    
    for (const sentence of textContent.sentences) {
      const isActive = sentence.id === $currentSentenceId;
      
      for (const item of sentence.items) {
        const div = document.createElement('div');
        div.className = `absolute pointer-events-none transition-colors duration-150 ${
          isActive && $settingsStore.highlightCurrentSentence
            ? 'bg-yellow-200/60 dark:bg-yellow-500/40'
            : ''
        }`;
        
        // Transform coordinates
        const [, , , , tx, ty] = item.transform;
        const x = tx * $renderOptions.scale;
        const y = (viewport.height / $renderOptions.scale - ty) * $renderOptions.scale - item.height * $renderOptions.scale;
        
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.width = `${item.width * $renderOptions.scale}px`;
        div.style.height = `${item.height * $renderOptions.scale}px`;
        
        div.dataset.sentenceId = sentence.id;
        
        textLayerRef.appendChild(div);
      }
    }
  }
  
  // Reactive rendering
  $effect(() => {
    if ($currentDocument && $currentPage && $renderOptions) {
      renderCurrentPage();
    }
  });
  
  // Update highlights when current sentence changes
  $effect(() => {
    if ($currentSentenceId !== undefined) {
      updateTextLayer();
    }
  });
  
  // Keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      pdfStore.nextPage();
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      pdfStore.previousPage();
    }
  }
  
  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div 
  bind:this={containerRef}
  class="relative flex h-full w-full flex-col items-center overflow-auto bg-muted/50 p-4"
>
  <!-- Page navigation header -->
  <div class="sticky top-0 z-10 mb-4 flex items-center gap-2 rounded-lg bg-background/80 p-2 shadow-sm backdrop-blur-sm">
    <Button
      variant="ghost"
      size="icon"
      onclick={() => pdfStore.previousPage()}
      disabled={$currentPage <= 1}
    >
      <ChevronLeft class="h-4 w-4" />
    </Button>
    
    <span class="min-w-[100px] text-center text-sm">
      Page {$currentPage} of {$totalPages}
    </span>
    
    <Button
      variant="ghost"
      size="icon"
      onclick={() => pdfStore.nextPage()}
      disabled={$currentPage >= $totalPages}
    >
      <ChevronRight class="h-4 w-4" />
    </Button>
    
    <div class="mx-2 h-6 w-px bg-border" />
    
    <Button
      variant="ghost"
      size="icon"
      onclick={() => pdfStore.zoomOut()}
    >
      <ZoomOut class="h-4 w-4" />
    </Button>
    
    <span class="min-w-[60px] text-center text-sm">
      {Math.round($renderOptions.scale * 100)}%
    </span>
    
    <Button
      variant="ghost"
      size="icon"
      onclick={() => pdfStore.zoomIn()}
    >
      <ZoomIn class="h-4 w-4" />
    </Button>
    
    <Button
      variant="ghost"
      size="icon"
      onclick={() => pdfStore.rotate()}
    >
      <RotateCw class="h-4 w-4" />
    </Button>
  </div>
  
  <!-- Canvas container -->
  <div class="relative shadow-lg">
    <canvas
      bind:this={canvasRef}
      class="rounded-sm bg-white"
    />
    
    <!-- Text highlight layer -->
    <div
      bind:this={textLayerRef}
      class="absolute inset-0 overflow-hidden"
    />
  </div>
</div>
```

#### 5.4 Floating Toolbar (`src/lib/components/audio/FloatingToolbar.svelte`)

```svelte
<script lang="ts">
  import { 
    audioStore, 
    isPlaying, 
    isPaused, 
    voices, 
    selectedVoice,
    playbackProgress 
  } from '$lib/stores/audio';
  import { pdfStore, currentPage, totalPages } from '$lib/stores/pdf';
  import { uiStore, isMobile } from '$lib/stores/ui';
  import { settingsStore } from '$lib/stores/settings';
  
  import { Button } from '$lib/components/ui/button';
  import { Slider } from '$lib/components/ui/slider';
  import { Progress } from '$lib/components/ui/progress';
  import * as Popover from '$lib/components/ui/popover';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  
  import {
    Play,
    Pause,
    Square,
    SkipBack,
    SkipForward,
    Volume2,
    Settings,
    Gauge,
    ChevronUp,
    ChevronDown,
    Bookmark,
    List
  } from 'lucide-svelte';
  
  let isExpanded = $state(false);
  let showVolumeSlider = $state(false);
  let showSpeedSlider = $state(false);
  
  function togglePlayPause() {
    if ($isPlaying) {
      audioStore.pause();
    } else {
      audioStore.play();
    }
  }
  
  function handleVoiceChange(value: string) {
    const voice = $voices.find(v => v.id === value);
    if (voice) {
      audioStore.setVoice(voice);
    }
  }
  
  function handleRateChange(value: number[]) {
    audioStore.setRate(value[0]);
  }
  
  function handleVolumeChange(value: number[]) {
    audioStore.setVolume(value[0]);
  }
</script>

<div
  class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform"
  class:w-[95vw]={$isMobile}
  class:max-w-md={!$isMobile}
>
  <div
    class="rounded-2xl bg-background/95 shadow-lg ring-1 ring-border backdrop-blur-md transition-all duration-300"
    class:pb-4={isExpanded}
  >
    <!-- Main controls -->
    <div class="flex items-center justify-between gap-2 p-3">
      <!-- Left: Playback controls -->
      <div class="flex items-center gap-1">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              onclick={() => audioStore.skipBackward()}
            >
              <SkipBack class="h-4 w-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Previous sentence</Tooltip.Content>
        </Tooltip.Root>
        
        <Button
          variant="default"
          size="icon"
          class="h-11 w-11 rounded-full"
          onclick={togglePlayPause}
        >
          {#if $isPlaying}
            <Pause class="h-5 w-5" />
          {:else}
            <Play class="h-5 w-5 translate-x-0.5" />
          {/if}
        </Button>
        
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              onclick={() => audioStore.skipForward()}
            >
              <SkipForward class="h-4 w-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Next sentence</Tooltip.Content>
        </Tooltip.Root>
        
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              onclick={() => audioStore.stop()}
            >
              <Square class="h-4 w-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Stop</Tooltip.Content>
        </Tooltip.Root>
      </div>
      
      <!-- Center: Progress indicator -->
      <div class="hidden flex-1 px-4 sm:block">
        <Progress value={$playbackProgress.percentage} class="h-1.5" />
        <p class="mt-1 text-center text-xs text-muted-foreground">
          {$playbackProgress.current} / {$playbackProgress.total}
        </p>
      </div>
      
      <!-- Right: Settings and expand -->
      <div class="flex items-center gap-1">
        <!-- Volume -->
        <Popover.Root bind:open={showVolumeSlider}>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="icon" class="h-9 w-9">
              <Volume2 class="h-4 w-4" />
            </Button>
          </Popover.Trigger>
          <Popover.Content class="w-48" side="top">
            <div class="space-y-2">
              <p class="text-sm font-medium">Volume</p>
              <Slider
                value={[$audioStore.volume]}
                max={1}
                step={0.1}
                onValueChange={handleVolumeChange}
              />
            </div>
          </Popover.Content>
        </Popover.Root>
        
        <!-- Speed -->
        <Popover.Root bind:open={showSpeedSlider}>
          <Popover.Trigger asChild>
            <Button variant="ghost" size="icon" class="h-9 w-9">
              <Gauge class="h-4 w-4" />
            </Button>
          </Popover.Trigger>
          <Popover.Content class="w-48" side="top">
            <div class="space-y-2">
              <p class="text-sm font-medium">Speed: {$audioStore.rate.toFixed(1)}x</p>
              <Slider
                value={[$audioStore.rate]}
                min={0.5}
                max={2}
                step={0.1}
                onValueChange={handleRateChange}
              />
            </div>
          </Popover.Content>
        </Popover.Root>
        
        <!-- Settings -->
        <Button
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          onclick={() => uiStore.openSettings()}
        >
          <Settings class="h-4 w-4" />
        </Button>
        
        <!-- Expand/Collapse -->
        <Button
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          onclick={() => (isExpanded = !isExpanded)}
        >
          {#if isExpanded}
            <ChevronDown class="h-4 w-4" />
          {:else}
            <ChevronUp class="h-4 w-4" />
          {/if}
        </Button>
      </div>
    </div>
    
    <!-- Expanded section -->
    {#if isExpanded}
      <div class="border-t px-4 pt-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <!-- Voice selection -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Voice</label>
            <Select.Root
              selected={{ value: $selectedVoice?.id || '', label: $selectedVoice?.name || 'Select voice' }}
              onSelectedChange={(v) => v && handleVoiceChange(v.value)}
            >
              <Select.Trigger>
                <Select.Value placeholder="Select a voice" />
              </Select.Trigger>
              <Select.Content class="max-h-60">
                {#each $voices as voice}
                  <Select.Item value={voice.id}>
                    {voice.name} ({voice.lang})
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          
          <!-- Page navigation -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Go to page</label>
            <div class="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max={$totalPages}
                value={$currentPage}
                class="h-9 w-full rounded-md border bg-background px-3 text-sm"
                onchange={(e) => pdfStore.goToPage(parseInt(e.currentTarget.value))}
              />
              <span class="text-sm text-muted-foreground">/ {$totalPages}</span>
            </div>
          </div>
        </div>
        
        <!-- Quick actions -->
        <div class="mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            class="flex-1"
            onclick={() => uiStore.toggleOutline()}
          >
            <List class="mr-2 h-4 w-4" />
            Contents
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="flex-1"
            onclick={() => uiStore.toggleBookmarks()}
          >
            <Bookmark class="mr-2 h-4 w-4" />
            Bookmarks
          </Button>
        </div>
      </div>
    {/if}
  </div>
</div>
```

#### 5.5 File Uploader (`src/lib/components/shared/FileUploader.svelte`)

```svelte
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Card } from '$lib/components/ui/card';
  import { Upload, Link, FileText } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  
  interface Props {
    onFileSelected: (file: File) => void;
  }
  
  let { onFileSelected }: Props = $props();
  
  let isDragging = $state(false);
  let urlInput = $state('');
  let fileInputRef: HTMLInputElement;
  
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }
  
  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
  }
  
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      validateAndUpload(files[0]);
    }
  }
  
  function handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    
    if (files && files.length > 0) {
      validateAndUpload(files[0]);
    }
  }
  
  function validateAndUpload(file: File) {
    if (file.type !== 'application/pdf') {
      toast.error('Invalid file type', {
        description: 'Please upload a PDF file'
      });
      return;
    }
    
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      toast.error('File too large', {
        description: 'Maximum file size is 100MB'
      });
      return;
    }
    
    onFileSelected(file);
  }
  
  async function handleUrlSubmit() {
    if (!urlInput.trim()) {
      toast.error('Please enter a URL');
      return;
    }
    
    try {
      const url = new URL(urlInput);
      
      // Fetch PDF from URL
      const response = await fetch(url.href);
      if (!response.ok) {
        throw new Error('Failed to fetch PDF');
      }
      
      const blob = await response.blob();
      const file = new File([blob], url.pathname.split('/').pop() || 'document.pdf', {
        type: 'application/pdf'
      });
      
      onFileSelected(file);
      
    } catch (error) {
      toast.error('Failed to load PDF', {
        description: 'Please check the URL and try again'
      });
    }
  }
</script>

<Card class="w-full max-w-lg p-8">
  <div class="space-y-6">
    <!-- Header -->
    <div class="text-center">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <FileText class="h-8 w-8 text-primary" />
      </div>
      <h1 class="text-2xl font-bold">PDF Narrator</h1>
      <p class="mt-2 text-muted-foreground">
        Upload a PDF to start reading with text-to-speech
      </p>
    </div>
    
    <!-- Drop zone -->
    <div
      class="relative rounded-lg border-2 border-dashed p-8 text-center transition-colors"
      class:border-primary={isDragging}
      class:bg-primary/5={isDragging}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      <input
        bind:this={fileInputRef}
        type="file"
        accept="application/pdf"
        class="hidden"
        onchange={handleFileInput}
      />
      
      <Upload class="mx-auto h-10 w-10 text-muted-foreground" />
      <p class="mt-4 text-sm text-muted-foreground">
        Drag and drop your PDF here, or
      </p>
      <Button
        variant="secondary"
        class="mt-2"
        onclick={() => fileInputRef.click()}
      >
        Browse files
      </Button>
    </div>
    
    <!-- Divider -->
    <div class="relative">
      <div class="absolute inset-0 flex items-center">
        <span class="w-full border-t" />
      </div>
      <div class="relative flex justify-center text-xs uppercase">
        <span class="bg-background px-2 text-muted-foreground">Or</span>
      </div>
    </div>
    
    <!-- URL input -->
    <div class="flex gap-2">
      <div class="relative flex-1">
        <Link class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="url"
          placeholder="Enter PDF URL..."
          class="pl-10"
          bind:value={urlInput}
          onkeydown={(e) => e.key === 'Enter' && handleUrlSubmit()}
        />
      </div>
      <Button onclick={handleUrlSubmit}>
        Load
      </Button>
    </div>
    
    <!-- Supported formats -->
    <p class="text-center text-xs text-muted-foreground">
      Supports PDF files up to 100MB
    </p>
  </div>
</Card>
```

#### 5.6 Keyboard Shortcuts (`src/lib/components/shared/KeyboardShortcuts.svelte`)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioStore } from '$lib/stores/audio';
  import { pdfStore } from '$lib/stores/pdf';
  import { uiStore } from '$lib/stores/ui';
  import { settingsStore } from '$lib/stores/settings';
  import { toast } from 'svelte-sonner';
  
  const shortcuts: Record<string, { description: string; action: () => void }> = {
    'Space': {
      description: 'Play/Pause',
      action: () => {
        if (audioStore.isPlaying) {
          audioStore.pause();
        } else {
          audioStore.play();
        }
      }
    },
    'Escape': {
      description: 'Stop playback',
      action: () => audioStore.stop()
    },
    'ArrowLeft': {
      description: 'Previous sentence',
      action: () => audioStore.skipBackward()
    },
    'ArrowRight': {
      description: 'Next sentence',
      action: () => audioStore.skipForward()
    },
    'ArrowUp': {
      description: 'Increase speed',
      action: () => {
        const newRate = Math.min(2, $settingsStore.defaultRate + 0.1);
        audioStore.setRate(newRate);
        toast.info(`Speed: ${newRate.toFixed(1)}x`);
      }
    },
    'ArrowDown': {
      description: 'Decrease speed',
      action: () => {
        const newRate = Math.max(0.5, $settingsStore.defaultRate - 0.1);
        audioStore.setRate(newRate);
        toast.info(`Speed: ${newRate.toFixed(1)}x`);
      }
    },
    'PageUp': {
      description: 'Previous page',
      action: () => pdfStore.previousPage()
    },
    'PageDown': {
      description: 'Next page',
      action: () => pdfStore.nextPage()
    },
    'Home': {
      description: 'First page',
      action: () => pdfStore.goToPage(1)
    },
    'End': {
      description: 'Last page',
      action: () => {
        const totalPages = $pdfStore.document?.numPages || 1;
        pdfStore.goToPage(totalPages);
      }
    },
    '+': {
      description: 'Zoom in',
      action: () => pdfStore.zoomIn()
    },
    '-': {
      description: 'Zoom out',
      action: () => pdfStore.zoomOut()
    },
    '0': {
      description: 'Reset zoom',
      action: () => pdfStore.setScale(1)
    },
    's': {
      description: 'Open settings',
      action: () => uiStore.openSettings()
    },
    'b': {
      description: 'Toggle bookmarks',
      action: () => uiStore.toggleBookmarks()
    },
    'o': {
      description: 'Toggle outline',
      action: () => uiStore.toggleOutline()
    },
    '?': {
      description: 'Show shortcuts',
      action: showShortcutsHelp
    }
  };
  
  function showShortcutsHelp() {
    const shortcutList = Object.entries(shortcuts)
      .map(([key, { description }]) => `${key}: ${description}`)
      .join('\n');
    
    toast.info('Keyboard Shortcuts', {
      description: shortcutList,
      duration: 5000
    });
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (!$settingsStore.keyboardShortcutsEnabled) return;
    
    // Ignore if typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    
    const key = event.key;
    const shortcut = shortcuts[key];
    
    if (shortcut) {
      event.preventDefault();
      shortcut.action();
    }
  }
  
  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });
  
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>
```

---

### Phase 6: Additional Components

Create these remaining components following the same patterns:

1. **`SettingsDialog.svelte`** - Dialog for app settings (theme, voice preferences, highlight colors)
2. **`OutlineSheet.svelte`** - Sheet component showing PDF table of contents
3. **`BookmarksSheet.svelte`** - Sheet for managing bookmarks
4. **`ThemeToggle.svelte`** - Dark/light/system theme switcher
5. **`VoiceSelector.svelte`** - Detailed voice selection with language filtering
6. **`SpeedControl.svelte`** - Playback speed slider with presets

---

### Phase 7: NixOS Deployment

#### 7.1 Nix Flake (`flake.nix`)

```nix
{
  description = "PDF Narrator - Client-side PDF reader with TTS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_20;
        pnpm = pkgs.nodePackages.pnpm;
      in
      {
        packages.default = pkgs.stdenv.mkDerivation {
          name = "pdf-narrator";
          src = ./.;

          buildInputs = [ nodejs pnpm ];

          buildPhase = ''
            export HOME=$(mktemp -d)
            pnpm install --frozen-lockfile
            pnpm build
          '';

          installPhase = ''
            mkdir -p $out
            cp -r build/* $out/
          '';
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            nodejs
            pnpm
            pkgs.nodePackages.typescript-language-server
          ];
        };
      }
    ) // {
      nixosModules.default = { config, lib, pkgs, ... }:
        with lib;
        let
          cfg = config.services.pdf-narrator;
        in
        {
          options.services.pdf-narrator = {
            enable = mkEnableOption "PDF Narrator service";
            
            port = mkOption {
              type = types.port;
              default = 3000;
              description = "Port to run the service on";
            };
            
            host = mkOption {
              type = types.str;
              default = "0.0.0.0";
              description = "Host to bind to";
            };
          };

          config = mkIf cfg.enable {
            systemd.services.pdf-narrator = {
              description = "PDF Narrator Service";
              wantedBy = [ "multi-user.target" ];
              after = [ "network.target" ];

              serviceConfig = {
                Type = "simple";
                DynamicUser = true;
                ExecStart = "${pkgs.nodejs_20}/bin/node ${self.packages.${pkgs.system}.default}/index.js";
                Environment = [
                  "PORT=${toString cfg.port}"
                  "HOST=${cfg.host}"
                  "NODE_ENV=production"
                ];
                Restart = "on-failure";
                RestartSec = "5s";
              };
            };
          };
        };
    };
}
```

#### 7.2 SvelteKit Node Adapter (`svelte.config.js`)

```javascript
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  
  kit: {
    adapter: adapter({
      out: 'build',
      precompress: true,
      envPrefix: ''
    }),
    alias: {
      $lib: './src/lib'
    }
  }
};

export default config;
```

---

## Testing Strategy

### Unit Tests
- PDF text extraction accuracy
- Sentence splitting logic
- Speech queue management
- Store state transitions

### Integration Tests
- PDF loading flow
- TTS playback sequence
- Bookmark persistence
- Settings synchronization

### E2E Tests (Playwright)
- Upload and view PDF
- Play/pause narration
- Navigate pages
- Voice selection
- Keyboard shortcuts

---

## Implementation Checklist

### Phase 1: Setup
- [ ] Initialize SvelteKit project
- [ ] Install and configure shadcn-svelte
- [ ] Set up Tailwind CSS
- [ ] Configure PDF.js worker

### Phase 2: PDF Services
- [ ] Implement PDF loader
- [ ] Implement text extractor
- [ ] Implement page renderer
- [ ] Create PDF store

### Phase 3: TTS Services
- [ ] Implement Web Speech API wrapper
- [ ] Implement speech queue
- [ ] Implement text processor
- [ ] Create audio store

### Phase 4: UI Components
- [ ] Create file uploader
- [ ] Create PDF viewer
- [ ] Create floating toolbar
- [ ] Create audio controls
- [ ] Create settings dialog
- [ ] Create outline sheet
- [ ] Create bookmarks sheet

### Phase 5: Features
- [ ] Implement text highlighting
- [ ] Implement keyboard shortcuts
- [ ] Implement bookmarks
- [ ] Implement reading position persistence
- [ ] Implement theme switching

### Phase 6: Polish
- [ ] Mobile responsiveness
- [ ] Error handling
- [ ] Loading states
- [ ] Toast notifications
- [ ] Accessibility (ARIA labels)

### Phase 7: Deployment
- [ ] Configure Node adapter
- [ ] Create Nix flake
- [ ] Test NixOS module
- [ ] Document deployment

---

## Notes for Claude Code

1. **Start with Phase 1** - Get the project structure set up first
2. **Test incrementally** - Each phase should produce working functionality
3. **Use TypeScript strictly** - All files should have proper types
4. **Follow shadcn-svelte patterns** - Import components correctly
5. **Handle SSR** - PDF.js and Web Speech API require browser environment checks
6. **Mobile-first CSS** - Use Tailwind's responsive utilities

## Commands Reference

```bash
# Development
pnpm dev

# Build
pnpm build

# Preview production build
pnpm preview

# Type checking
pnpm check

# Linting
pnpm lint

# Add shadcn component
pnpm dlx shadcn-svelte@next add [component-name]
```
---

# Finger Drumming Practice Application

A web-based finger drumming practice application built with SvelteKit, inspired by Melodics and Quest for Groove.

## Features

- **MIDI Controller Support**: Connect any MIDI drum controller (tested with Akai MPC One)
- **Real-time Feedback**: Visual note highway with color-coded hit detection (Perfect, Good, Early, Late, Miss)
- **MIDI File Import**: Load your own MIDI files or use the built-in demo lesson
- **Scoring System**: Comprehensive scoring with accuracy, streaks, and grades
- **Audio Engine**: Metronome support using Tone.js
- **Validation Engine**: Precise timing validation with configurable windows

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5 (runes)
- **Audio**: Tone.js for audio scheduling and metronome
- **MIDI**: @tonejs/midi for MIDI file parsing
- **MIDI Input**: Web MIDI API for real-time controller input
- **Canvas**: Canvas 2D for performant note highway rendering
- **State**: Svelte stores for reactive state management

## File Structure

```
src/lib/
├── types/              # TypeScript type definitions
│   ├── midi.ts         # MIDI device and note types
│   ├── lesson.ts       # Lesson and note data structures
│   ├── score.ts        # Scoring and validation types
│   ├── theme.ts        # Theme configuration types
│   └── settings.ts     # App settings types
├── stores/             # Svelte stores
│   ├── settingsStore.ts   # User preferences
│   ├── midiStore.ts       # MIDI device state
│   └── sessionStore.ts    # Practice session state
├── midi/               # MIDI handling
│   ├── MidiService.ts     # Web MIDI API wrapper
│   └── MidiParser.ts      # MIDI file parsing
├── validation/         # Scoring logic
│   └── ValidationEngine.ts # Note validation and scoring
├── audio/              # Audio engine
│   └── AudioEngine.ts     # Tone.js wrapper
└── components/         # Svelte components
    └── NoteHighway.svelte # Canvas-based note display

src/routes/drums/       # Main practice route
└── +page.svelte        # Practice page
```

## Browser Compatibility

**Supported Browsers**:
- ✅ Chrome/Chromium (recommended)
- ✅ Edge
- ⚠️ Firefox (requires Web MIDI to be enabled in about:config)
- ❌ Safari (does not support Web MIDI API)

## Usage

1. **Connect MIDI Controller**:
   - Connect your MIDI drum controller via USB
   - For Akai MPC One: Put device in Controller Mode
   - Select your device from the MIDI Controller dropdown

2. **Load a Lesson**:
   - Click "Load Demo Lesson" for a basic rock beat
   - Or upload your own MIDI file (.mid/.midi)

3. **Practice**:
   - Hit Play to start the lesson
   - Play along with your MIDI controller
   - Watch the note highway and real-time feedback
   - Track your score and accuracy

## Scoring System

- **Perfect** (100 pts): Within ±25ms
- **Good** (80 pts): Within ±50ms
- **Early/Late** (50 pts): Within ±100ms but outside good window
- **Miss** (0 pts): Outside 100ms window or wrong note

**Grades**:
- S: ≥95% accuracy
- A: ≥85% accuracy
- B: ≥75% accuracy
- C: ≥65% accuracy
- D: ≥50% accuracy
- F: <50% accuracy

## Features Implemented

✅ Phase 1 (MVP Foundation):
- MIDI device connection and recognition
- Real-time MIDI input processing
- MIDI file loading and parsing
- Performance validation engine
- Visual note display (Guitar Hero style)
- Audio playback system (metronome)
- Scoring and statistics

## Future Enhancements

The following features from the original product plan could be added:

- **Practice Modes**: Tempo adjustment (50%-150%), A-B loop, count-in, no-fail mode
- **Audio**: Backing track support, drum sample playback
- **Visual Enhancements**: Velocity-based note sizing, advanced animations
- **Progress Tracking**: Historical data, achievements, streaks
- **Content**: Lesson library, difficulty categories, genre filtering
- **Customization**: Custom pad mappings, theme system
- **Advanced**: Audio-to-MIDI conversion, multiplayer features

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Type check
npm run check

# Build for production
npm run build
```

## Architecture Notes

### MIDI Processing
- Uses Web MIDI API for low-latency controller input
- Sub-10ms processing target
- High-resolution timestamps via performance.now()

### Validation Engine
- Configurable timing windows (perfect, good, miss)
- Optional velocity scoring
- Real-time accuracy calculation
- Streak tracking

### Note Highway
- Canvas-based for 60fps performance
- 4-column layout (kicks, snares, hi-hats, other)
- Color-coded feedback
- Smooth scrolling animation

### State Management
- Svelte stores for reactive state
- LocalStorage persistence for settings
- Derived stores for computed values

## Credits

Based on the implementation plans:
- finger-drumming-claude-code-implementation-plan.md
- finger-drumming-claude-code-implementation-plan-part2.md
- Product Plan.md

Inspired by:
- [Melodics](https://melodics.com/)
- [Quest for Groove](https://questforgroove.com/)
