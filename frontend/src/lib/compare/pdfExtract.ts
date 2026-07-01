import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { isPageNumber } from "./contentFilter";
import type { CharBBox, TextBlock } from "./types";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const HEADER_FOOTER_RATIO = 0.08;

interface ItemEntry {
  text: string;
  bbox: number[];
  charBboxes: CharBBox[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  fontSize: number;
}

/** PDF.js 基线坐标（左下原点）→ 页面左上原点 bbox */
function toTopLeftBBox(
  tx: number,
  ty: number,
  width: number,
  fontSize: number,
  pageHeight: number,
): number[] {
  const ascent = fontSize * 0.75;
  const descent = fontSize * 0.25;
  const yBaselineFromTop = pageHeight - ty;
  return [
    tx,
    yBaselineFromTop - ascent,
    tx + width,
    yBaselineFromTop + descent,
  ];
}

/** 按等宽假设为 TextItem 内每个字符估算 bbox */
function charBboxesForItem(item: TextItem, pageHeight: number): CharBBox[] {
  const str = item.str;
  const len = str.length;
  if (len === 0) return [];

  const tx = item.transform[4];
  const ty = item.transform[5];
  const fontSize = Math.abs(item.transform[3]) || item.height || 12;
  const charWidth = len > 0 ? item.width / len : item.width;
  const result: CharBBox[] = new Array(len);

  for (let i = 0; i < len; i++) {
    const cx0 = tx + i * charWidth;
    result[i] = {
      start: i,
      end: i + 1,
      bbox: toTopLeftBBox(cx0, ty, charWidth, fontSize, pageHeight),
    };
  }

  return result;
}

function bboxFromCharBboxes(charBboxes: CharBBox[]): number[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const cb of charBboxes) {
    const b = cb.bbox;
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]);
    y1 = Math.max(y1, b[3]);
  }
  return [x0, y0, x1, y1];
}

/** 去掉 bbox 偏高的水印字符（半透明编号等与正文混排时） */
function stripWatermarkChars(
  text: string,
  charBboxes: CharBBox[],
  fontSize: number,
): { text: string; charBboxes: CharBBox[] } | null {
  if (!text || charBboxes.length === 0) return null;

  const heights = charBboxes.map((cb) => cb.bbox[3] - cb.bbox[1]);
  const sorted = heights.slice().sort((a, b) => a - b);
  const medianH = sorted[Math.floor(sorted.length / 2)] || fontSize;
  const threshold = Math.max(medianH * 1.8, fontSize * 1.8);

  let nextText = "";
  const nextBboxes: CharBBox[] = [];
  let offset = 0;

  for (let i = 0; i < text.length; i++) {
    const cb = charBboxes[i];
    if (!cb) continue;
    const h = cb.bbox[3] - cb.bbox[1];
    if (h > threshold) continue;
    nextText += text[i];
    nextBboxes.push({ start: offset, end: offset + 1, bbox: cb.bbox });
    offset++;
  }

  if (!nextText) return null;
  return { text: nextText, charBboxes: nextBboxes };
}

/** 行首数字水印与正文混排时，按 bbox 高度差剥离前缀编号 */
function stripLeadingNumericWatermark(
  text: string,
  charBboxes: CharBBox[],
): { text: string; charBboxes: CharBBox[] } {
  if (charBboxes.length < 8) return { text, charBboxes };

  const tailHeights = charBboxes.slice(6).map((cb) => cb.bbox[3] - cb.bbox[1]);
  const sortedTail = tailHeights.slice().sort((a, b) => a - b);
  const tailMedian = sortedTail[Math.floor(sortedTail.length / 2)] || 14;
  const threshold = tailMedian * 1.5;

  let cutAt = 0;
  for (let i = 0; i < Math.min(6, text.length); i++) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) break;
    const h = charBboxes[i].bbox[3] - charBboxes[i].bbox[1];
    if (h > threshold) cutAt = i + 1;
    else break;
  }
  if (cutAt < 4) return { text, charBboxes };

  const slicedBboxes = charBboxes.slice(cutAt);
  const nextText = text.slice(cutAt);
  const nextBboxes = slicedBboxes.map((cb, i) => ({
    start: i,
    end: i + 1,
    bbox: cb.bbox,
  }));
  return { text: nextText, charBboxes: nextBboxes };
}

function cleanWatermarkText(
  text: string,
  charBboxes: CharBBox[],
  fontSize: number,
): { text: string; charBboxes: CharBBox[] } | null {
  const stripped = stripWatermarkChars(text, charBboxes, fontSize);
  if (!stripped) return null;
  const cleaned = stripLeadingNumericWatermark(
    stripped.text,
    stripped.charBboxes,
  );
  if (!cleaned.text) return null;
  return cleaned;
}

function itemFromTextItem(
  item: TextItem,
  pageHeight: number,
): ItemEntry | null {
  const str = item.str;
  if (!str) return null;

  const tx = item.transform[4];
  const ty = item.transform[5];
  const fontSize = Math.abs(item.transform[3]) || item.height || 12;
  const rawCharBboxes = charBboxesForItem(item, pageHeight);
  const bbox = toTopLeftBBox(tx, ty, item.width, fontSize, pageHeight);
  const bboxHeight = bbox[3] - bbox[1];

  // 整段纯数字且 bbox 偏高 → 水印，不参与比对
  if (/^\d{4,}$/.test(str.trim()) && bboxHeight > fontSize * 1.2) return null;

  const cleaned = cleanWatermarkText(str, rawCharBboxes, fontSize);
  if (!cleaned) return null;

  const entryBbox = bboxFromCharBboxes(cleaned.charBboxes);

  return {
    text: cleaned.text,
    bbox: entryBbox,
    charBboxes: cleaned.charBboxes,
    x0: entryBbox[0],
    y0: entryBbox[1],
    x1: entryBbox[2],
    y1: entryBbox[3],
    fontSize,
  };
}

function buildLineGroup(entries: ItemEntry[]) {
  const textParts: string[] = new Array(entries.length);
  const charBboxes: CharBBox[] = [];
  const fontSizes: number[] = new Array(entries.length);
  let offset = 0;

  for (let e = 0; e < entries.length; e++) {
    const entry = entries[e];
    textParts[e] = entry.text;
    fontSizes[e] = entry.fontSize;

    for (const cb of entry.charBboxes) {
      charBboxes.push({
        start: offset + cb.start,
        end: offset + cb.end,
        bbox: cb.bbox,
      });
    }

    offset += entry.text.length;
  }

  let fontSum = 0;
  for (const fs of fontSizes) fontSum += fs;
  const avgFont = fontSizes.length > 0 ? fontSum / fontSizes.length : 12;
  const joined = textParts.join("");
  const cleaned = cleanWatermarkText(joined, charBboxes, avgFont);
  if (!cleaned) {
    return {
      text: "",
      x0: 0,
      y0: 0,
      x1: 0,
      y1: 0,
      charBboxes: [],
      fontSizes: [],
    };
  }

  const lineBbox = bboxFromCharBboxes(cleaned.charBboxes);

  return {
    text: cleaned.text,
    x0: lineBbox[0],
    y0: lineBbox[1],
    x1: lineBbox[2],
    y1: lineBbox[3],
    charBboxes: cleaned.charBboxes,
    fontSizes,
  };
}

/** 按垂直中心距将同一页的 text item 聚合成行 */
function groupItemsIntoLines(
  items: ItemEntry[],
): ReturnType<typeof buildLineGroup>[] {
  if (items.length === 0) return [];

  const groups: ReturnType<typeof buildLineGroup>[] = [];
  let current: ItemEntry[] = [items[0]];

  for (let i = 1; i < items.length; i++) {
    const prev = current[current.length - 1];
    const curr = items[i];
    const lineHeight = Math.max(prev.y1 - prev.y0, prev.fontSize);
    const prevCy = (prev.y0 + prev.y1) * 0.5;
    const currCy = (curr.y0 + curr.y1) * 0.5;

    if (Math.abs(prevCy - currCy) < lineHeight * 0.5) {
      current.push(curr);
    } else {
      groups.push(buildLineGroup(current));
      current = [curr];
    }
  }

  groups.push(buildLineGroup(current));
  return groups;
}

/** 提取单页文本块，可选过滤页眉页脚区域 */
async function extractPageBlocks(
  doc: PDFDocumentProxy,
  pageNum: number,
  ignoreHeaderFooter: boolean,
): Promise<TextBlock[]> {
  const page = await doc.getPage(pageNum);
  const pageHeight = page.getViewport({ scale: 1 }).height;
  const pageIndex = pageNum - 1;
  const headerLimit = pageHeight * HEADER_FOOTER_RATIO;
  const footerLimit = pageHeight * (1 - HEADER_FOOTER_RATIO);

  const textContent = await page.getTextContent();
  const items: ItemEntry[] = [];
  for (const raw of textContent.items) {
    if (!("str" in raw)) continue;
    const entry = itemFromTextItem(raw as TextItem, pageHeight);
    if (entry) items.push(entry);
  }

  if (items.length > 1) {
    items.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  }

  const blocks: TextBlock[] = [];
  for (const group of groupItemsIntoLines(items)) {
    const visibleText = group.text.trim() ? group.text : "";

    if (visibleText && ignoreHeaderFooter) {
      const centerY = (group.y0 + group.y1) * 0.5;
      if (centerY < headerLimit || centerY > footerLimit) {
        if (isPageNumber(visibleText.trim())) continue;
      }
    }

    let fontSum = 0;
    for (const fs of group.fontSizes) fontSum += fs;
    const fontSize =
      group.fontSizes.length > 0
        ? fontSum / group.fontSizes.length
        : Math.max(group.y1 - group.y0, 12);

    blocks.push({
      page: pageIndex,
      text: visibleText,
      bbox: [group.x0, group.y0, group.x1, group.y1],
      fontSize,
      charBboxes: group.charBboxes,
    });
  }

  return blocks;
}

/** 从 PDF ArrayBuffer 提取全部页面的 TextBlock（含字符级 bbox） */
export async function extractTextBlocks(
  data: ArrayBuffer,
  ignoreHeaderFooter: boolean,
): Promise<TextBlock[]> {
  const doc = await getDocument({ data }).promise;
  const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);

  const pageBlocks = await Promise.all(
    pageNums.map((pageNum) =>
      extractPageBlocks(doc, pageNum, ignoreHeaderFooter),
    ),
  );

  return pageBlocks.flat();
}
