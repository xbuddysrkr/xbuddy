import React, { useRef, useEffect } from 'react'

/**
 * EditableText
 * 
 * Free-form, natural canvas text editor matching the Academic Toolkit architecture.
 * - ZERO React children inside contentEditable so React's reconciler never destroys
 *   DOM text nodes or cursor positions during typing.
 * - Deleting characters (Backspace/Delete) deletes cleanly with ZERO bounce-back.
 * - Completely unboxed: NO dashed outlines, NO solid orange focus boxes, NO background shifts.
 * - Two-way live synchronization:
 *     - External changes (Form input) update Canvas immediately when field is not focused.
 *     - Canvas typing/deletions update Form input and shared resumeStore in real time.
 */
export default function EditableText({
  value = '',
  onChange,
  placeholder = '',
  className = '',
  style = {},
  as: Component = 'span',
  multiline = false,
}) {
  const ref = useRef(null)
  const isFocusedRef = useRef(false)
  const lastReportedValueRef = useRef(value)

  // 1. External Form -> Canvas synchronization:
  // When 'value' updates from the form on the left, update the canvas DOM text
  // only if the user is not actively typing inside this element.
  useEffect(() => {
    if (!ref.current) return
    if (isFocusedRef.current) return

    const displayVal = (value !== undefined && value !== null && value !== '') 
      ? value 
      : (placeholder || '')

    if (ref.current.textContent !== displayVal) {
      ref.current.textContent = displayVal
    }
    lastReportedValueRef.current = value
  }, [value, placeholder])

  // Initial mount: ensure text content is populated immediately
  useEffect(() => {
    if (ref.current) {
      const displayVal = (value !== undefined && value !== null && value !== '') 
        ? value 
        : (placeholder || '')
      ref.current.textContent = displayVal
      lastReportedValueRef.current = value
    }
  }, [])

  // 2. User focuses on the canvas element
  const handleFocus = () => {
    isFocusedRef.current = true

    // If current text equals placeholder, auto-select it all on focus
    // so any keystroke or backspace immediately replaces or clears it cleanly
    if (ref.current && placeholder && ref.current.textContent === placeholder) {
      setTimeout(() => {
        if (!ref.current || !isFocusedRef.current) return
        try {
          const sel = window.getSelection()
          if (sel) {
            const range = document.createRange()
            range.selectNodeContents(ref.current)
            sel.removeAllRanges()
            sel.addRange(range)
          }
        } catch (e) {
          // ignore selection errors
        }
      }, 0)
    }
  }

  // 3. User types or deletes on the canvas (Native DOM event)
  const handleInput = (e) => {
    const rawText = (e.currentTarget.textContent || '').replace(/\r?\n+$/, '')
    lastReportedValueRef.current = rawText

    if (onChange) {
      onChange(rawText)
    }
  }

  // 4. User finishes editing and blurs
  const handleBlur = (e) => {
    isFocusedRef.current = false
    const currentText = (e.currentTarget.textContent || '').trim()

    // If left completely blank and a placeholder exists, restore the placeholder
    // so the field remains visible, positioned, and clickable on the canvas
    if (!currentText && placeholder && ref.current) {
      ref.current.textContent = placeholder
      if (onChange && lastReportedValueRef.current !== '') {
        onChange('')
      }
    } else if (onChange && currentText !== value) {
      onChange(currentText)
    }
  }

  const handleKeyDown = (e) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  const handlePaste = (e) => {
    // Paste as plain text to avoid foreign HTML / fonts
    e.preventDefault()
    const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') || ''
    if (!multiline) {
      const clean = text.replace(/[\r\n]+/g, ' ')
      document.execCommand('insertText', false, clean)
    } else {
      document.execCommand('insertText', false, text)
    }
  }

  return (
    <Component
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onFocus={handleFocus}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      title="Click to edit"
      className={`outline-none border-none bg-transparent cursor-text select-text ${className}`}
      style={{
        outline: 'none',
        border: 'none',
        background: 'transparent',
        minWidth: '1ch',
        ...style,
      }}
    />
  )
}
