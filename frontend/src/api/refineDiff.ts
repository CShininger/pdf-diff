import type { DiffSegment } from '../lib/compare/types'

export interface RefineDiffRequest {
  diffSegments: DiffSegment[]
}

export interface RefineDiffResponse {
  diffSegments: DiffSegment[]
}

/** 算法 refine 占位：接口未就绪，原样返回 diffSegments */
export async function refineDiffSegments(diffSegments: DiffSegment[]): Promise<DiffSegment[]> {
  return diffSegments
}
