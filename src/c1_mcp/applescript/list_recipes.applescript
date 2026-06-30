tell application "Capture One"
  set rows to {"name" & tab & "enabled" & tab & "output_format"}
  tell current document
    repeat with r in recipes
      set recipeName to ""
      set recipeEnabled to ""
      set recipeFormat to ""
      try
        set recipeName to name of r as text
      end try
      try
        set recipeEnabled to enabled of r as text
      end try
      try
        set recipeFormat to output format of r as text
      end try
      set end of rows to recipeName & tab & recipeEnabled & tab & recipeFormat
    end repeat
  end tell
  set AppleScript's text item delimiters to linefeed
  return rows as text
end tell
