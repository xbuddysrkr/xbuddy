/**
 * Single reliable page range parser for custom page selection.
 * Supports: single pages ("1"), comma-separated ("1,3,5"), ranges ("1-3"), mixed ("1-3,7,9", "2,4-6").
 * Validates against document totalPages, deduplicates, and sorts ascending (1-based).
 *
 * @param {string} input - User provided custom page string
 * @param {number} totalPages - Total pages in the document
 * @returns {{ valid: boolean, selectedPages: number[], selectedPageCount: number, pageRangeString: string, error?: string }}
 */
export function parsePageRange(input, totalPages) {
  const maxPages = Math.max(0, parseInt(totalPages, 10) || 0)

  if (typeof input !== 'string' || !input.trim()) {
    return {
      valid: false,
      selectedPages: [],
      selectedPageCount: 0,
      pageRangeString: '',
      error: 'Enter a valid page number or range.',
    }
  }

  const trimmed = input.trim()

  // Reject malformed comma constructs (e.g. ",,", leading or trailing commas)
  if (trimmed.includes(',,') || trimmed.startsWith(',') || trimmed.endsWith(',')) {
    return {
      valid: false,
      selectedPages: [],
      selectedPageCount: 0,
      pageRangeString: '',
      error: 'Invalid page range format.',
    }
  }

  const tokens = trimmed.split(',').map(t => t.trim())
  if (tokens.length === 0 || tokens.some(t => !t)) {
    return {
      valid: false,
      selectedPages: [],
      selectedPageCount: 0,
      pageRangeString: '',
      error: 'Invalid page range format.',
    }
  }

  const pagesSet = new Set()

  for (const token of tokens) {
    if (token.includes('-')) {
      const parts = token.split('-').map(p => p.trim())
      // Reject malformed ranges like "1-", "-3", "1--5", "1-3-5"
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: 'Invalid page range format.',
        }
      }
      if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: 'Invalid page range format.',
        }
      }
      const start = parseInt(parts[0], 10)
      const end = parseInt(parts[1], 10)

      if (isNaN(start) || isNaN(end) || start > end) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: 'Invalid page range format.',
        }
      }

      if (start < 1) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: 'Page numbers must be 1 or greater.',
        }
      }

      if (maxPages > 0 && end > maxPages) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: `Page ${end} exceeds total document pages (${maxPages}).`,
        }
      }

      for (let p = start; p <= end; p++) {
        pagesSet.add(p)
      }
    } else {
      if (!/^\d+$/.test(token)) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: 'Invalid page range format.',
        }
      }

      const page = parseInt(token, 10)
      if (isNaN(page) || page < 1) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: 'Page numbers must be 1 or greater.',
        }
      }

      if (maxPages > 0 && page > maxPages) {
        return {
          valid: false,
          selectedPages: [],
          selectedPageCount: 0,
          pageRangeString: '',
          error: `Page ${page} exceeds total document pages (${maxPages}).`,
        }
      }

      pagesSet.add(page)
    }
  }

  const selectedPages = Array.from(pagesSet).sort((a, b) => a - b)
  if (selectedPages.length === 0) {
    return {
      valid: false,
      selectedPages: [],
      selectedPageCount: 0,
      pageRangeString: '',
      error: 'Enter a valid page number or range.',
    }
  }

  const pageRangeString = formatPagesToRange(selectedPages)

  return {
    valid: true,
    selectedPages,
    selectedPageCount: selectedPages.length,
    pageRangeString,
  }
}

/**
 * Format sorted numbers array into compact range string (e.g. [1,2,3,7,9] -> "1-3,7,9")
 *
 * @param {number[]} pages
 * @returns {string}
 */
export function formatPagesToRange(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return ''
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b)
  const ranges = []
  let start = sorted[0]
  let prev = start

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i]
    if (curr === prev + 1) {
      prev = curr
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
      start = curr
      prev = curr
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
  return ranges.join(',')
}

/**
 * Helper to generate 1-based array of all pages [1 ... totalPages]
 *
 * @param {number} totalPages
 * @returns {number[]}
 */
export function resolveAllPages(totalPages) {
  const count = Math.max(0, parseInt(totalPages, 10) || 0)
  return Array.from({ length: count }, (_, i) => i + 1)
}
