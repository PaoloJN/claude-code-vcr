Output assets/demo.gif

Set Shell "zsh"
Set FontSize 18
Set Width 1200
Set Height 760
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Type "claude-code-vcr --tools"
Enter
Sleep 900ms

Type "claude-code-vcr list --root demo/sessions --limit 2"
Enter
Sleep 1400ms

Type "claude-code-vcr search Glob --root demo/sessions"
Enter
Sleep 1400ms

Type "claude-code-vcr replay session-alpha --root demo/sessions"
Enter
Sleep 1800ms

Type "claude-code-vcr diff session-alpha session-beta --root demo/sessions"
Enter
Sleep 2200ms
