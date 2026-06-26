import { useEffect, useMemo, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFPageProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { DiffOverlay } from './DiffOverlay'
import type { ChangeItem } from '../types/compare'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PageMetrics {
  pdfWidth: number
  pdfHeight: number
}

interface PdfViewerProps {
  title: string
  fileUrl: string
  side: 'template' | 'contract'
  changes: ChangeItem[]
  activeChangeId: string | null
  scrollToPage: number | null
}

export function PdfViewer({
  title,
  fileUrl,
  side,
  changes,
  activeChangeId,
  scrollToPage,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(480)
  const [pageMetrics, setPageMetrics] = useState<Map<number, PageMetrics>>(new Map())

  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector(`.pdf-pane[data-side="${side}"]`)
      if (container) {
        setPageWidth(Math.min(container.clientWidth - 32, 520))
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [side])

  useEffect(() => {
    if (scrollToPage === null) return
    const el = document.getElementById(`${side}-page-${scrollToPage + 1}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [scrollToPage, side])

  const pageChanges = useMemo(() => {
    const map = new Map<number, ChangeItem[]>()
    for (const change of changes) {
      if (change.type === 'equal') continue
      const info = side === 'template' ? change.template : change.contract
      if (!info) continue
      const list = map.get(info.page) ?? []
      list.push(change)
      map.set(info.page, list)
    }
    return map
  }, [changes, side])

  const handlePageLoad = (pageNumber: number, page: PDFPageProxy) => {
    const viewport = page.getViewport({ scale: 1 })
    setPageMetrics((prev) => {
      const next = new Map(prev)
      next.set(pageNumber, { pdfWidth: viewport.width, pdfHeight: viewport.height })
      return next
    })
  }

  return (
    <div className="pdf-pane" data-side={side}>
      <h3>{title}</h3>
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
        loading={<div className="pdf-loading">PDF 加载中…</div>}
        error={<div className="pdf-error">PDF 加载失败</div>}
      >
        {Array.from({ length: numPages }, (_, index) => {
          const pageNumber = index + 1
          const pageIndex = index
          const highlights = pageChanges.get(pageIndex) ?? []
          const metrics = pageMetrics.get(pageNumber)

          return (
            <div key={pageNumber} id={`${side}-page-${pageNumber}`} className="pdf-page-wrap">
              <div className="pdf-page-inner">
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onLoadSuccess={(page) => handlePageLoad(pageNumber, page)}
                />
                {metrics &&
                  highlights.map((change) => {
                    const info = side === 'template' ? change.template : change.contract
                    if (!info || info.bboxes.length === 0) return null
                    return (
                      <DiffOverlay
                        key={change.id}
                        bboxes={info.bboxes}
                        side={side}
                        pdfWidth={metrics.pdfWidth}
                        pdfHeight={metrics.pdfHeight}
                        active={change.id === activeChangeId}
                      />
                    )
                  })}
              </div>
              <span className="page-label">第 {pageNumber} 页</span>
            </div>
          )
        })}
      </Document>
    </div>
  )
}
