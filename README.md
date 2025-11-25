# EPUB Reader

A full-featured web-based EPUB reader with dark mode support.

## Features

- **EPUB Support**: Complete EPUB parsing and rendering
- **Dark Mode**: Toggle between light and dark themes
- **Table of Contents**: Navigate chapters easily
- **Reading Controls**: Previous/next chapter navigation
- **Customization**: Adjustable font size and line height
- **Keyboard Navigation**: Arrow keys for chapter navigation
- **Responsive Design**: Works on desktop and mobile
- **Local Storage**: Remembers theme and reading preferences

## Usage

1. Open `index.html` in a web browser
2. Click "Open EPUB" to load an EPUB file
3. Use the sidebar menu (☰) to access table of contents
4. Navigate with Previous/Next buttons or arrow keys
5. Toggle dark mode with the moon/sun button (🌙/☀️)
6. Adjust reading settings with the font size and line height sliders

## Keyboard Shortcuts

- `←` / `→` : Previous/Next chapter
- `Escape` : Close sidebar

## Technical Details

- Uses JSZip library for EPUB file parsing
- Supports EPUB 2.0 and 3.0 formats
- Parses OPF, NCX, and XHTML files
- CSS custom properties for theming
- Local storage for preferences

## Browser Compatibility

- Modern browsers with ES6+ support
- File API support required for EPUB loading
- Local storage support for preferences

## Files

- `index.html` - Main application structure
- `styles.css` - Styling with dark mode support
- `script.js` - EPUB parsing and reader functionality