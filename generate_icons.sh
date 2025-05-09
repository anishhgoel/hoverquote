#!/bin/bash

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick is required. Please install it first:"
    echo "  - macOS: brew install imagemagick"
    echo "  - Ubuntu/Debian: sudo apt-get install imagemagick"
    exit 1
fi

# Generate 48x48 icon
convert -background none -size 48x48 icon.svg icon48.png

# Generate 128x128 icon
convert -background none -size 128x128 icon.svg icon128.png

echo "Icons generated successfully!" 