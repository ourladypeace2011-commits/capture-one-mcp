tell application "Capture One"
  set rows to {"id" & tab & "name" & tab & "rating" & tab & "color_tag" & tab & "file"}
  tell current document to set selectedList to every variant whose selected is true
  repeat with v in selectedList
    set variantId to ""
    set variantName to ""
    set variantRating to ""
    set variantColorTag to ""
    set variantFile to ""
    try
      set variantId to id of v as text
    end try
    try
      set variantName to name of v as text
    end try
    try
      set variantRating to rating of v as text
    end try
    try
      set variantColorTag to color tag of v as text
    end try
    try
      set variantFile to path of parent image of v as text
    end try
    set end of rows to variantId & tab & variantName & tab & variantRating & tab & variantColorTag & tab & variantFile
  end repeat
  set AppleScript's text item delimiters to linefeed
  return rows as text
end tell
