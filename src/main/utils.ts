import { readFile } from 'fs/promises'
import sharp from 'sharp'

// Helper: Convert base64 data URL to buffer
export function dataURLToBuffer(dataURL: string): Buffer {
  const base64Data = dataURL.split(',')[1]
  return Buffer.from(base64Data, 'base64')
}

// Helper: Parse JSONL file
export async function parseJSONL(filePath: string): Promise<Array<Record<string, unknown>>> {
  const content = await readFile(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  return lines.map((line) => JSON.parse(line))
}

// Helper: Load image file and convert to base64 data URL
export async function loadImageAsDataURL(filePath: string): Promise<string> {
  try {
    // Use sharp to convert image to PNG format (handles TIFF, WebP, etc.)
    const buffer = await sharp(filePath)
      .png() // Convert to PNG for web compatibility
      .toBuffer()

    const base64 = buffer.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch (error) {
    throw new Error(
      `Failed to load image: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
