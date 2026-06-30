tell application "Capture One"
  tell current document to set selectedList to every variant whose selected is true
  if (count of selectedList) is 0 then error "No selected variants."
  set clonedCount to 0
  repeat with v in selectedList
    try
      clone variant v
      set clonedCount to clonedCount + 1
    end try
  end repeat
  return "cloned=" & (clonedCount as text)
end tell
