# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NeuroTrace is an Electron application for neural image annotation with graph editing capabilities. It allows users to overlay multiple image layers (original, mask, annotation) and create node-edge graphs on top for marking neural structures or other annotations.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server with hot reload
pnpm dev

# Type checking
pnpm typecheck           # Check both node and web
pnpm typecheck:node      # Check main/preload only
pnpm typecheck:web       # Check renderer only

# Linting and formatting
pnpm lint                # Run ESLint
pnpm format              # Format with Prettier

# Build application
pnpm build               # Type check and build

# Platform-specific builds
pnpm build:mac           # macOS build
pnpm build:win           # Windows build
pnpm build:linux         # Linux build
pnpm build:unpack        # Build without packaging
```

## Architecture

### Electron Multi-Process Architecture

This application follows the standard Electron architecture with three main processes:

1. **Main Process** (`src/main/index.ts`)
   - Manages application lifecycle and native OS integration
   - Creates and controls the BrowserWindow
   - Standard Electron boilerplate with minimal IPC (only a test ping handler)

2. **Preload Process** (`src/preload/index.ts`)
   - Context bridge between main and renderer processes
   - Currently exposes minimal APIs (placeholder for future IPC)
   - Uses `contextBridge` for secure IPC exposure

3. **Renderer Process** (`src/renderer/src/`)
   - React-based UI running in the browser window
   - Contains the main application logic

### Renderer Architecture

The renderer follows a component-based React architecture:

- **App.tsx**: Root component managing global state and layout
  - Orchestrates `EditorCanvas` and `LayerControls` components
  - Manages image layers, layer settings, edit mode, and graph data
  - Two modes: `view` (pan/zoom) and `edit` (node/edge creation)

- **EditorCanvas.tsx**: Main interactive canvas component
  - Handles all pan/zoom/transform logic via ViewTransform state
  - Renders layered images (original, mask, annotation) with configurable opacity
  - Renders graph (nodes + edges) as SVG overlay
  - Implements mouse interactions for:
    - Creating nodes/edges in edit mode (left-click)
    - Panning (middle-click, view mode, or shift/ctrl+drag)
    - Zooming (mouse wheel)
    - Edge selection/deletion (right-click context menu, Del key)
  - Chain creation mode: click to create nodes and auto-connect them
  - Auto-cleanup: removes isolated nodes when edges are deleted

- **LayerControls.tsx**: Sidebar for image layer management
  - Upload controls for three image layers
  - Visibility toggles and opacity sliders per layer
  - Built-in keyboard shortcut instructions

- **types.ts**: Core type definitions
  - `GraphData`, `Node`, `Edge`: Graph structure
  - `ImageLayers`, `LayerSettings`: Image overlay configuration
  - `ViewTransform`: Pan/zoom state
  - `EditMode`: View vs edit mode

### State Management

State is managed with React `useState` at the App level and passed down via props:
- Image data stored as base64 data URLs
- Graph data (nodes/edges) with UUID-based IDs
- No external state management library (Redux, Zustand, etc.)

### Coordinate System

The canvas uses a dual coordinate system:
- **Screen coordinates**: Browser viewport pixels
- **Image coordinates**: Transformed coordinates accounting for pan/zoom
- Conversion handled by `toImageCoords()` helper in EditorCanvas
- All graph nodes/edges stored in image coordinates for zoom independence

## Build Configuration

- **electron-vite**: Development and build tool
  - Configured in `electron.vite.config.ts`
  - Uses Vite for fast HMR in development
  - Main and preload use `externalizeDepsPlugin`
  - Renderer uses React plugin and Tailwind CSS Vite plugin

- **TypeScript**: Project uses project references
  - `tsconfig.node.json`: Main and preload (Node.js environment)
  - `tsconfig.web.json`: Renderer (browser environment)
  - Path alias: `@renderer/*` maps to `src/renderer/src/*`

- **Tailwind CSS v4**: Utility-first CSS framework
  - Integrated via `@tailwindcss/vite` plugin
  - Dark theme with slate color palette
  - Used extensively for all UI styling

## Key Implementation Details

### Graph Editing UX

The graph editor implements a "chain creation" pattern:
1. Click in edit mode creates a node
2. That node becomes the "active chain start"
3. Next click creates another node AND an edge connecting them
4. Chain continues until right-click or ESC cancels
5. Clicking existing nodes extends the chain to them

### Layer Rendering Order (z-index)

1. Original image (z-0)
2. Mask image (z-10)
3. Annotation image (z-20)
4. Graph SVG layer (z-30)

All images use `pointer-events-none` to allow graph interactions to pass through.

### IPC Communication

Currently minimal - the app is self-contained in the renderer. If adding file system operations or native features, extend:
- `src/preload/index.ts`: Add API definitions
- `src/preload/index.d.ts`: Add TypeScript types
- `src/main/index.ts`: Add IPC handlers

## Package Manager

This project uses **pnpm**. The `.npmrc` file enforces pnpm usage. Do not use npm or yarn.
