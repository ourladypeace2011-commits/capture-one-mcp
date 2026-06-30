tell application "Capture One"
  set docName to ""
  set selectedCount to 0
  try
    set docName to name of current document as text
  end try
  try
    tell current document to set selectedCount to count of (every variant whose selected is true)
  end try
  return "appVersion=" & (app version as text) & linefeed & "currentDocument=" & docName & linefeed & "selectedVariants=" & (selectedCount as text)
end tell
