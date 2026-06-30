tell application "Capture One"
  set rows to {"variant_id" & tab & "variant_name" & tab & "field" & tab & "value"}
  tell current document to set selectedList to every variant whose selected is true
  repeat with v in selectedList
    set variantId to ""
    set variantName to ""
    try
      set variantId to id of v as text
    end try
    try
      set variantName to name of v as text
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "color profile" & tab & (color profile of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "film curve" & tab & (film curve of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "white balance preset" & tab & (white balance preset of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "temperature" & tab & (temperature of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "tint" & tab & (tint of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "exposure" & tab & (exposure of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "brightness" & tab & (brightness of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "contrast" & tab & (contrast of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "saturation" & tab & (saturation of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "highlight recovery" & tab & (highlight recovery of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "shadow recovery" & tab & (shadow recovery of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "white recovery" & tab & (white recovery of adjustments of v as text)
    end try
    try
      set end of rows to variantId & tab & variantName & tab & "black recovery" & tab & (black recovery of adjustments of v as text)
    end try
  end repeat
  set AppleScript's text item delimiters to linefeed
  return rows as text
end tell
