// Converts a File object to a base64 string (without the data:...;base64, prefix)
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // reader.result looks like "data:image/png;base64,ABC123..."
      // We strip the prefix and send only the raw base64 string
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}
