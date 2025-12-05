# NeuroTrace

An Electron-based desktop application for neural image annotation with interactive graph editing capabilities. Built with React, TypeScript, and Tailwind CSS.

## Features

- **Multi-layer Image Overlay**: Load and overlay up to three image layers (original, mask, annotation) with independent visibility and opacity controls
- **Interactive Graph Editor**: Create and edit node-edge graphs directly on the canvas
  - Chain creation mode: Click to create connected nodes in sequence
  - Auto-cleanup: Automatically removes isolated nodes when edges are deleted
  - Context menu for edge deletion
- **Pan & Zoom**: Smooth canvas navigation with mouse wheel zoom and middle-click/drag panning
- **Dual Edit Modes**:
  - **View Mode**: Navigate the canvas without accidentally editing
  - **Edit Mode**: Create nodes and edges with click interactions
- **Keyboard Shortcuts**: Built-in shortcuts for efficient workflow (Tab to toggle modes, Esc to cancel operations)

## Technology Stack

- **Electron**: Cross-platform desktop application framework
- **React 19**: Modern UI library with hooks
- **TypeScript**: Type-safe development
- **Tailwind CSS v4**: Utility-first styling with dark theme
- **electron-vite**: Fast development and build tooling
- **pnpm**: Efficient package management

## Prerequisites

- Node.js (v18 or higher recommended)
- pnpm (required - enforced by `.npmrc`)

## Installation

```bash
pnpm install
```

## Development

Start the development server with hot reload:

```bash
pnpm dev
```

## Type Checking

```bash
# Check all TypeScript files
pnpm typecheck

# Check main/preload processes only
pnpm typecheck:node

# Check renderer process only
pnpm typecheck:web
```

## Code Quality

```bash
# Run ESLint
pnpm lint

# Format code with Prettier
pnpm format
```

## Building

```bash
# Build for all platforms (with type checking)
pnpm build

# Platform-specific builds
pnpm build:mac      # macOS
pnpm build:win      # Windows
pnpm build:linux    # Linux

# Build without packaging (for testing)
pnpm build:unpack
```

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── index.ts    # Application lifecycle and window management
│   ├── pipeline.ts # Image processing pipeline
│   ├── type.ts     # Type definitions
│   └── utils.ts    # Utility functions
├── preload/        # Electron preload scripts
│   ├── index.ts    # Context bridge setup
│   └── index.d.ts  # Type declarations
└── renderer/       # React application (browser window)
    └── src/
        ├── components/
        │   ├── EditorCanvas.tsx    # Main canvas with pan/zoom/graph rendering
        │   ├── LayerControls.tsx   # Image layer management sidebar
        │   └── PipelineConfig.tsx  # Pipeline configuration UI
        ├── types.ts                # Core type definitions
        ├── index.tsx               # Application entry point
        └── App.tsx                 # Root component
```

## Architecture

### Electron Multi-Process

- **Main Process**: Manages application lifecycle and native OS integration
- **Preload Process**: Secure context bridge between main and renderer
- **Renderer Process**: React-based UI running in the browser window

### Coordinate System

The canvas uses dual coordinate systems:
- **Screen coordinates**: Browser viewport pixels
- **Image coordinates**: Zoom-independent coordinates for storing graph data

All graph nodes and edges are stored in image coordinates to maintain position accuracy across zoom levels.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/)
- [ESLint Extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier Extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Usage

1. Launch the application
2. Use the sidebar controls to upload image layers (original, mask, annotation)
3. Adjust layer visibility and opacity as needed
4. Press **Tab** to switch between View and Edit modes
5. In Edit mode:
   - **Left-click** to create nodes and edges
   - **Right-click** on edges to delete them
   - **Esc** to cancel the current operation
6. In View mode:
   - **Middle-click + drag** to pan
   - **Mouse wheel** to zoom
   - **Shift/Ctrl + drag** as alternative pan method

## License

This project is licensed under the terms specified by the author.

## Contributing

For development guidance and architectural details, see [CLAUDE.md](CLAUDE.md).
