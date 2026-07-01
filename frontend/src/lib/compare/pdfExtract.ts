import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { isPageNumber } from './contentFilter'
import type { CharBBox, TextBlock } from './types'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const HEADER_FOOTER_RATIO = 0.08

interface ItemEntry {
  text: string
  bbox: number[]
  charBboxes: CharBBox[]
  x0: number
  y0: number
  x1: number
  y1: number
  fontSize: number
}

function toTopLeftBBox(
  tx: number,
  ty: number,
  width: number,
  fontSize: number,
  pageHeight: number,
): number[] {
  const ascent = fontSize * 0.75
  const descent = fontSize * 0.25
  const yBaselineFromTop = pageHeight - ty
  return [tx, yBaselineFromTop - ascent, tx + width, yBaselineFromTop + descent]
}

function charBboxesForItem(item: TextItem, pageHeight: number): CharBBox[] {
  const str = item.str
  const len = str.length
  if (len === 0) return []

  const tx = item.transform[4]
  const ty = item.transform[5]
  const fontSize = Math.abs(item.transform[3]) || item.height || 12
  const charWidth = len > 0 ? item.width / len : item.width
  const result: CharBBox[] = new Array(len)

  for (let i = 0; i < len; i++) {
    const cx0 = tx + i * charWidth
    result[i] = {
      start: i,
      end: i + 1,
      bbox: toTopLeftBBox(cx0, ty, charWidth, fontSize, pageHeight),
    }
  }

  return result
}

function itemFromTextItem(item: TextItem, pageHeight: number): ItemEntry | null {
  const str = item.str
  if (!str) return null

  const tx = item.transform[4]
  const ty = item.transform[5]
  const fontSize = Math.abs(item.transform[3]) || item.height || 12
  const charBboxes = charBboxesForItem(item, pageHeight)
  const bbox = toTopLeftBBox(tx, ty, item.width, fontSize, pageHeight)

  return {
    text: str,
    bbox,
    charBboxes,
    x0: bbox[0],
    y0: bbox[1],
    x1: bbox[2],
    y1: bbox[3],
    fontSize,
  }
}

function buildLineGroup(entries: ItemEntry[]) {
  const textParts: string[] = new Array(entries.length)
  const charBboxes: CharBBox[] = []
  const fontSizes: number[] = new Array(entries.length)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let offset = 0

  for (let e = 0; e < entries.length; e++) {
    const entry = entries[e]
    textParts[e] = entry.text
    fontSizes[e] = entry.fontSize

    for (const cb of entry.charBboxes) {
      charBboxes.push({ start: offset + cb.start, end: offset + cb.end, bbox: cb.bbox })
    }

    x0 = Math.min(x0, entry.x0)
    y0 = Math.min(y0, entry.y0)
    x1 = Math.max(x1, entry.x1)
    y1 = Math.max(y1, entry.y1)
    offset += entry.text.length
  }

  return { text: textParts.join(''), x0, y0, x1, y1, charBboxes, fontSizes }
}

function groupItemsIntoLines(items: ItemEntry[]): ReturnType<typeof buildLineGroup>[] {
  if (items.length === 0) return []

  const groups: ReturnType<typeof buildLineGroup>[] = []
  let current: ItemEntry[] = [items[0]]

  for (let i = 1; i < items.length; i++) {
    const prev = current[current.length - 1]
    const curr = items[i]
    const lineHeight = Math.max(prev.y1 - prev.y0, prev.fontSize)
    const prevCy = (prev.y0 + prev.y1) * 0.5
    const currCy = (curr.y0 + curr.y1) * 0.5

    if (Math.abs(prevCy - currCy) < lineHeight * 0.5) {
      current.push(curr)
    } else {
      groups.push(buildLineGroup(current))
      current = [curr]
    }
  }

  groups.push(buildLineGroup(current))
  return groups
}

async function extractPageBlocks(
  doc: PDFDocumentProxy,
  pageNum: number,
  ignoreHeaderFooter: boolean,
): Promise<TextBlock[]> {
  const page = await doc.getPage(pageNum)
  const pageHeight = page.getViewport({ scale: 1 }).height
  const pageIndex = pageNum - 1
  const headerLimit = pageHeight * HEADER_FOOTER_RATIO
  const footerLimit = pageHeight * (1 - HEADER_FOOTER_RATIO)

  const textContent = await page.getTextContent()
  const items: ItemEntry[] = []

  for (const raw of textContent.items) {
    if (!('str' in raw)) continue
    const entry = itemFromTextItem(raw as TextItem, pageHeight)
    if (entry) items.push(entry)
  }

  if (items.length > 1) {
    items.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  }

  const blocks: TextBlock[] = []
  for (const group of groupItemsIntoLines(items)) {
    const visibleText = group.text.trim() ? group.text : ''

    if (visibleText && ignoreHeaderFooter) {
      const centerY = (group.y0 + group.y1) * 0.5
      if (centerY < headerLimit || centerY > footerLimit) {
        if (isPageNumber(visibleText.trim())) continue
      }
    }

    let fontSum = 0
    for (const fs of group.fontSizes) fontSum += fs
    const fontSize =
      group.fontSizes.length > 0
        ? fontSum / group.fontSizes.length
        : Math.max(group.y1 - group.y0, 12)

    blocks.push({
      page: pageIndex,
      text: visibleText,
      bbox: [group.x0, group.y0, group.x1, group.y1],
      fontSize,
      charBboxes: group.charBboxes,
    })
  }

  return blocks
}

export async function extractTextBlocks(
  data: ArrayBuffer,
  ignoreHeaderFooter: boolean,
): Promise<TextBlock[]> {
  const doc = await getDocument({ data }).promise
  const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1)

  const pageBlocks = await Promise.all(
    pageNums.map((pageNum) => extractPageBlocks(doc, pageNum, ignoreHeaderFooter)),
  )

  return pageBlocks.flat()
}
