// ── ADD THESE TWO CASES TO YOUR doGet() FUNCTION IN GOOGLE APPS SCRIPT ──────
// Find your existing: if (action === 'saveOrder') { ... }
// Add these alongside it:

// CASE 1 — Print agent calls this on startup to store its tunnel URL
if (action === 'setTunnelUrl') {
  const url = e.parameter.url || ''
  const props = PropertiesService.getScriptProperties()
  props.setProperty('TUNNEL_URL', url)
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON)
}

// CASE 2 — Frontend calls this to get the current tunnel URL
if (action === 'getTunnelUrl') {
  const props = PropertiesService.getScriptProperties()
  const url   = props.getProperty('TUNNEL_URL') || ''
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, url }))
    .setMimeType(ContentService.MimeType.JSON)
}
