import React, { useRef, useEffect } from 'react'

/**
 * EditableText
 * 
 * True two-way synchronized inline canvas editor component.
 * - Reads from shared state
 * - Writes to shared state on input and blur
 * - Protects cursor positioning during user typing
 * - Updates immediately when form input changes
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
  const isEditingRef = useRef(false)

  // Synchronize canvas text from state when not actively being edited by user
  useEffect(() => {
    if (!isEditingRef.current && ref.current) {
      const current = ref.current.innerText
      const expected = value || ''
      if (current !== expected && !(current === placeholder && !value)) {
        ref.current.innerText = expected || placeholder
      }
    }
  }, [value, placeholder])

  const handleInput = (e) => {
    const text = e.currentTarget.innerText
    if (onChange) {
      onChange(text)
    }
  }

  const handleFocus = () => {
    isEditingRef.current = true
    if (ref.current && ref.current.innerText === placeholder && !value) {
      ref.current.innerText = ''
    }
  }

  const handleBlur = (e) => {
    isEditingRef.current = false
    const text = e.currentTarget.innerText.trim()
    if (!text && placeholder && ref.current) {
      ref.current.innerText = placeholder
    }
    if (onChange) {
      onChange(text)
    }
  }

  const handleKeyDown = (e) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
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
      title="Click to edit on canvas"
      className={`outline-none cursor-text rounded-xs transition-colors hover:bg-orange-50/50 hover:outline-dashed hover:outline-1 hover:outline-orange-300 focus:bg-orange-50/80 focus:outline-solid focus:outline-1.5 focus:outline-[#F78C25] ${className}`}
      style={{
        minWidth: '1ch',
        ...style,
      }}
    >
      {value || placeholder}
    </Component>
  )
}
