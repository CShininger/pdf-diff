export type DiffTab = 'frontend-diff' | 'python-diff' | 'java-diff' | 'golang-diff'

export const DIFF_TABS: { id: DiffTab; label: string }[] = [
  { id: 'frontend-diff', label: 'Frontend Diff' },
  { id: 'python-diff', label: 'Python Diff' },
  { id: 'java-diff', label: 'Java Diff' },
  { id: 'golang-diff', label: 'Golang Diff' },
]
